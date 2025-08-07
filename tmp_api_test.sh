#!/bin/bash

# Debug Free Tier Eligibility Script
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "${GREEN}[STEP]${NC} $1"; }
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

echo "🔍 AWS Free Tier Eligibility Debug"
echo "=================================="

# Check current region
REGION=$(aws configure get region)
print_info "Current region: $REGION"

# Check account info
print_step "Checking AWS account information..."
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
USER_ARN=$(aws sts get-caller-identity --query 'Arn' --output text)
print_info "Account ID: $ACCOUNT_ID"
print_info "User: $USER_ARN"

# Check what instance types are free tier eligible
print_step "Checking free tier eligible instance types..."
echo ""

FREE_TIER_INSTANCES=$(aws ec2 describe-instance-types \
  --filters "Name=free-tier-eligible,Values=true" \
  --query 'InstanceTypes[*].[InstanceType,FreeTierEligible,ProcessorInfo.SupportedArchitectures[0]]' \
  --output table)

if [ -z "$FREE_TIER_INSTANCES" ]; then
    print_warning "No free tier eligible instances found with the filter method."
    print_info "This might be a regional issue. Let's try alternative methods..."
    
    # Alternative: Check specific instance types
    print_step "Checking specific instance types..."
    
    INSTANCE_TYPES=("t2.micro" "t3.micro" "t4g.micro")
    
    for instance_type in "${INSTANCE_TYPES[@]}"; do
        echo -n "Checking $instance_type: "
        RESULT=$(aws ec2 describe-instance-types \
          --instance-types "$instance_type" \
          --query 'InstanceTypes[0].FreeTierEligible' \
          --output text 2>/dev/null || echo "NOT_AVAILABLE")
        
        if [ "$RESULT" = "True" ]; then
            echo -e "${GREEN}✅ FREE TIER ELIGIBLE${NC}"
            WORKING_INSTANCE_TYPE="$instance_type"
        elif [ "$RESULT" = "False" ]; then
            echo -e "${RED}❌ NOT FREE TIER ELIGIBLE${NC}"
        else
            echo -e "${YELLOW}⚠️ NOT AVAILABLE IN REGION${NC}"
        fi
    done
else
    echo "$FREE_TIER_INSTANCES"
    
    # Extract the first free tier eligible instance type
    WORKING_INSTANCE_TYPE=$(echo "$FREE_TIER_INSTANCES" | grep -E "^\|.*\|.*True.*\|" | head -1 | awk -F'|' '{print $2}' | xargs)
fi

print_step "Checking account free tier status..."

# Check if account is still within free tier period
ACCOUNT_CREATION_DATE=$(aws organizations describe-account --account-id "$ACCOUNT_ID" --query 'Account.JoinedTimestamp' --output text 2>/dev/null || echo "Unable to determine")

if [ "$ACCOUNT_CREATION_DATE" != "Unable to determine" ]; then
    print_info "Account creation: $ACCOUNT_CREATION_DATE"
    
    # Calculate if within 12 months (rough check)
    CURRENT_DATE=$(date +%s)
    ACCOUNT_DATE=$(date -d "$ACCOUNT_CREATION_DATE" +%s 2>/dev/null || echo "0")
    
    if [ "$ACCOUNT_DATE" != "0" ]; then
        MONTHS_SINCE_CREATION=$(( (CURRENT_DATE - ACCOUNT_DATE) / (30 * 24 * 3600) ))
        print_info "Approximate months since account creation: $MONTHS_SINCE_CREATION"
        
        if [ "$MONTHS_SINCE_CREATION" -gt 12 ]; then
            print_warning "⚠️ Your account may be outside the 12-month free tier period!"
        fi
    fi
else
    print_warning "Cannot determine account creation date."
    print_info "Check your AWS account creation date manually in the AWS Console."
fi

# Check region-specific free tier availability
print_step "Checking region-specific free tier information..."

# Some regions don't have t2.micro, check for alternatives
if [ "$REGION" = "me-south-1" ] || [ "$REGION" = "eu-north-1" ] || [ "$REGION" = "ap-east-1" ]; then
    print_warning "Region $REGION typically uses t3.micro instead of t2.micro for free tier"
    RECOMMENDED_INSTANCE="t3.micro"
else
    RECOMMENDED_INSTANCE="t2.micro"
fi

print_info "Recommended instance type for region $REGION: $RECOMMENDED_INSTANCE"

# Final recommendation
print_step "🎯 Recommended Solution"

if [ -n "$WORKING_INSTANCE_TYPE" ]; then
    print_info "✅ Use instance type: $WORKING_INSTANCE_TYPE"
    
    # Generate working launch command
    SECURITY_GROUP_ID=$(aws ec2 describe-security-groups --group-names hpc-platform-sg --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "SECURITY_GROUP_NOT_FOUND")
    AMI_ID=$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2 --query 'Parameters[0].Value' --output text 2>/dev/null || echo "AMI_NOT_FOUND")
    
    echo ""
    print_info "🚀 Try this launch command:"
    echo ""
    cat << EOF
aws ec2 run-instances \\
  --image-id $AMI_ID \\
  --count 1 \\
  --instance-type $WORKING_INSTANCE_TYPE \\
  --key-name hpc-platform-key \\
  --security-group-ids $SECURITY_GROUP_ID \\
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=HPC-Platform}]'
EOF
    
    # Create a working launch script
    cat > launch-working-instance.sh << EOF
#!/bin/bash
# Auto-generated working launch script

set -e

echo "🚀 Launching EC2 instance with working free tier configuration..."

INSTANCE_ID=\$(aws ec2 run-instances \\
  --image-id $AMI_ID \\
  --count 1 \\
  --instance-type $WORKING_INSTANCE_TYPE \\
  --key-name hpc-platform-key \\
  --security-group-ids $SECURITY_GROUP_ID \\
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=HPC-Platform}]' \\
  --query 'Instances[0].InstanceId' \\
  --output text)

echo "✅ Instance launched: \$INSTANCE_ID"

# Wait for running state
echo "⏳ Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "\$INSTANCE_ID"

# Get public IP
PUBLIC_IP=\$(aws ec2 describe-instances \\
  --instance-ids "\$INSTANCE_ID" \\
  --query 'Reservations[0].Instances[0].PublicIpAddress' \\
  --output text)

echo "🎉 Instance ready!"
echo "Instance ID: \$INSTANCE_ID"
echo "Public IP: \$PUBLIC_IP"

# Update instance details
cat > aws-instance-details.txt << DETAILS
AWS Instance Details
==================
Instance ID: \$INSTANCE_ID
Public IP: \$PUBLIC_IP
Instance Type: $WORKING_INSTANCE_TYPE
AMI ID: $AMI_ID
Region: $REGION
Key Pair: hpc-platform-key
Security Group: hpc-platform-sg ($SECURITY_GROUP_ID)

Connection Command:
ssh -i ~/.ssh/hpc-platform-key.pem ec2-user@\$PUBLIC_IP

Application URL (after deployment):
http://\$PUBLIC_IP:3000

Created: \$(date)
DETAILS

echo "✅ Instance details saved to: aws-instance-details.txt"
echo "✅ Ready for deployment!"
EOF
    
    chmod +x launch-working-instance.sh
    print_info "✅ Created: ./launch-working-instance.sh"
    
else
    print_error "❌ No free tier eligible instances found!"
    print_warning "Possible solutions:"
    echo "1. Check if your AWS account is within the 12-month free tier period"
    echo "2. Try a different region (us-east-1, us-west-2, eu-west-1)"
    echo "3. Contact AWS support to verify free tier eligibility"
    echo "4. Consider using the new AWS Free Tier with \$200 credits instead"
fi

# Additional troubleshooting
print_step "🔧 Additional Troubleshooting"

print_info "If the issue persists, try these steps:"
echo "1. Switch to a different region:"
echo "   aws configure set region us-west-2"
echo ""
echo "2. Check your free tier usage in AWS Console:"
echo "   Go to Billing & Cost Management → Free Tier"
echo ""
echo "3. Try launching via AWS Console to see more detailed error messages"
echo ""
echo "4. Check if you're using the new 2025 Free Tier model (\$200 credits)"
echo "   This may require different instance types"

print_info "Run this script again after changing regions or checking your account status."