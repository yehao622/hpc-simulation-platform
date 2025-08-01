// api-gateway/src/graphql/server.ts
// GraphQL Server Setup with Apollo Server Express

import { ApolloServer } from 'apollo-server-express';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvers } from './resolvers';
import { Pool } from 'pg';

// Authentication helper for GraphQL context
const jwt = require('jsonwebtoken');

// GraphQL Context Interface
interface GraphQLContext {
  user?: {
    userId: number;
    email: string;
    role: string;
  };
  db: Pool;
}

// Create GraphQL schema
const createGraphQLSchema = () => {
  // Read schema from file
  const schemaPath = join(__dirname, 'schema.graphql');
  let typeDefs: string;
  
  try {
    typeDefs = readFileSync(schemaPath, 'utf8');
  } catch (error) {
    console.warn('⚠️ GraphQL schema file not found, using inline schema');
    // Fallback inline schema for development
    typeDefs = `
      scalar DateTime
      scalar JSON

      enum JobStatus {
        QUEUED
        RUNNING
        COMPLETED
        FAILED
        CANCELLED
      }

      enum WorkType {
        READ
        WRITE
        MIXED
      }

      type User {
        id: ID!
        email: String!
        username: String!
        firstName: String!
        lastName: String!
        organization: String
        role: String!
        isActive: Boolean!
        createdAt: DateTime!
        updatedAt: DateTime!
        statistics: UserStatistics!
      }

      type UserStatistics {
        totalJobs: Int!
        completedJobs: Int!
        runningJobs: Int!
        failedJobs: Int!
        totalSimulationTime: Float!
        avgThroughput: Float
      }

      type SimulationJob {
        id: ID!
        userId: ID!
        user: User!
        name: String!
        description: String
        status: JobStatus!
        simulationTime: Float!
        createdAt: DateTime!
        startedAt: DateTime
        completedAt: DateTime
        progress: Int!
        results: SimulationResults
      }

      type SimulationResults {
        totalThroughput: Float!
        averageLatency: Float!
        maxQueueLength: Int!
      }

      type TopologyTemplate {
        id: ID!
        name: String!
        type: String!
        description: String
        parameters: JSON!
        isPublic: Boolean!
        createdAt: DateTime!
      }

      type WorkloadPattern {
        id: ID!
        name: String!
        description: String
        parameters: JSON!
        isPublic: Boolean!
        createdAt: DateTime!
      }

      input CreateSimulationJobInput {
        name: String!
        description: String
        topologyId: ID!
        workloadId: ID!
        simulationTime: Float = 10.0
        numComputeNodes: Int = 16
        numStorageNodes: Int = 8
        workType: WorkType = READ
        dataSizeMb: Float = 128.0
        readProbability: Float = 0.5
        requestRate: Float = 0.001
      }

      type Query {
        me: User!
        simulationJob(id: ID!): SimulationJob
        simulationJobs(
          status: JobStatus
          limit: Int = 20
          offset: Int = 0
        ): [SimulationJob!]!
        topologyTemplates(
          publicOnly: Boolean = false
          limit: Int = 50  
        ): [TopologyTemplate!]!
        workloadPatterns(
          publicOnly: Boolean = false
          limit: Int = 50
        ): [WorkloadPattern!]!
        myAnalytics: UserStatistics!
        activeJobs: [SimulationJob!]!
        searchJobs(query: String!, limit: Int = 20): [SimulationJob!]!
      }

      type Mutation {
        createSimulationJob(input: CreateSimulationJobInput!): SimulationJob!
        cancelSimulationJob(id: ID!): SimulationJob!
        deleteSimulationJob(id: ID!): Boolean!
      }

      type Subscription {
        jobStatusUpdated(jobId: ID): JobStatusUpdate!
      }

      type JobStatusUpdate {
        jobId: ID!
        status: JobStatus!
        progress: Int
        message: String
        timestamp: DateTime!
      }
    `;
  }

  return makeExecutableSchema({
    typeDefs,
    resolvers
  });
};

// Create Apollo Server
export const createApolloServer = (): ApolloServer => {
  const schema = createGraphQLSchema();

  return new ApolloServer({
    schema,
    context: async ({ req }): Promise<GraphQLContext> => {
      // Initialize database connection
      const db = new Pool({
        connectionString: process.env.DATABASE_URL
      });

      // Extract JWT token from request
      let user = undefined;
      
      try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          const jwtSecret = process.env.JWT_SECRET;
          
          if (token && jwtSecret) {
            const decoded: any = jwt.verify(token, jwtSecret);
            
            // Get user role from database
            const userResult = await db.query(
              'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
              [decoded.userId]
            );
            
            if (userResult.rows[0]) {
              user = {
                userId: decoded.userId,
                email: decoded.email,
                role: userResult.rows[0].role
              };
              
              console.log(`🔍 GraphQL authenticated user: ${user.email} (Role: ${user.role})`);
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ GraphQL authentication failed:', error.message);
        // Continue without authentication - some queries may be public
      }

      return {
        user,
        db
      };
    },

    // Enable GraphQL Playground in development
    introspection: process.env.NODE_ENV !== 'production',
    playground: process.env.NODE_ENV !== 'production' ? {
      settings: {
        'request.credentials': 'include',
        'general.betaUpdates': false,
        'editor.theme': 'dark',
        'editor.cursorShape': 'line',
        'editor.reuseHeaders': true,
        'tracing.hideTracingResponse': true,
        'schema.polling.enable': true,
        'schema.polling.endpointFilter': '*localhost*',
        'schema.polling.interval': 2000
      },
      tabs: [
        {
          endpoint: '/graphql',
          query: `# Welcome to HPC Simulation Platform GraphQL API!
# Here are some example queries to get you started:

# 1. Get your user profile and statistics
query MyProfile {
  me {
    id
    email
    username
    firstName
    lastName
    organization
    role
    statistics {
      totalJobs
      completedJobs
      runningJobs
      failedJobs
      totalSimulationTime
      avgThroughput
    }
  }
}

# 2. Get your simulation jobs
query MyJobs {
  simulationJobs(limit: 10) {
    id
    name
    status
    progress
    simulationTime
    createdAt
    results {
      totalThroughput
      averageLatency
    }
  }
}

# 3. Get available templates
query Templates {
  topologyTemplates(limit: 10) {
    id
    name
    type
    description
    isPublic
  }
  workloadPatterns(limit: 10) {
    id
    name
    description
    isPublic
  }
}

# 4. Create a new simulation job
mutation CreateJob {
  createSimulationJob(input: {
    name: "GraphQL Test Simulation"
    description: "Testing GraphQL API functionality"
    topologyId: "1"
    workloadId: "1"
    simulationTime: 15.0
    numComputeNodes: 12
    workType: READ
    dataSizeMb: 256.0
  }) {
    id
    name
    status
    progress
    createdAt
  }
}

# To use these queries:
# 1. Get JWT token from REST API login
# 2. Add to HTTP headers: { "Authorization": "Bearer YOUR_JWT_TOKEN" }
# 3. Run queries above
`
        }
      ]
    } : false,

    // Error formatting
    formatError: (error) => {
      console.error('🔥 GraphQL Error:', error);
      
      // Don't expose internal details in production
      if (process.env.NODE_ENV === 'production') {
        // Log the full error internally but return sanitized version
        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_ERROR',
          path: error.path
        };
      }
      
      return {
        message: error.message,
        code: error.extensions?.code || 'INTERNAL_ERROR',
        path: error.path,
        locations: error.locations,
        stack: error.stack
      };
    },

    // Request logging in development
    plugins: process.env.NODE_ENV !== 'production' ? [
      {
        requestDidStart() {
          return {
            didResolveOperation(requestContext) {
              const operationName = requestContext.request.operationName;
              const query = requestContext.request.query;
              console.log(`🔍 GraphQL Operation: ${operationName || 'Anonymous'}`);
              
              if (query && query.length < 500) {
                console.log(`📝 Query: ${query.replace(/\s+/g, ' ').trim()}`);
              }
            },
            didEncounterErrors(requestContext) {
              console.error('🔥 GraphQL request errors:', requestContext.errors);
            }
          };
        }
      }
    ] : []
  });
};

// GraphQL Subscription setup (for WebSocket integration)
export const setupGraphQLSubscriptions = (apolloServer: ApolloServer, httpServer: any) => {
  try {
    const { SubscriptionServer } = require('subscriptions-transport-ws');
    const { execute, subscribe } = require('graphql');
    
    // Create subscription server
    SubscriptionServer.create(
      {
        execute,
        subscribe,
        schema: apolloServer.schema,
        onConnect: async (connectionParams: any) => {
          // Authenticate WebSocket connection for subscriptions
          try {
            const token = connectionParams.authorization?.replace('Bearer ', '');
            if (token) {
              const jwtSecret = process.env.JWT_SECRET;
              if (jwtSecret) {
                const decoded: any = jwt.verify(token, jwtSecret);
                console.log(`🔗 GraphQL subscription authenticated: ${decoded.email}`);
                return { userId: decoded.userId, email: decoded.email };
              }
            }
          } catch (error) {
            console.warn('⚠️ GraphQL subscription authentication failed:', error.message);
            throw new Error('Authentication failed');
          }
          
          throw new Error('Authentication required for subscriptions');
        },
        onDisconnect: () => {
          console.log('📡 GraphQL subscription client disconnected');
        }
      },
      {
        server: httpServer,
        path: '/graphql-subscriptions'
      }
    );
    
    console.log('🔔 GraphQL subscriptions enabled at /graphql-subscriptions');
    
  } catch (error) {
    console.warn('⚠️ GraphQL subscriptions not available:', error.message);
    console.info('📝 Subscriptions require subscriptions-transport-ws package');
  }
};

// Health check for GraphQL endpoint
export const graphqlHealthCheck = async (apolloServer: ApolloServer): Promise<boolean> => {
  try {
    // Simple introspection query to check if GraphQL is working
    const result = await apolloServer.executeOperation({
      query: `
        query HealthCheck {
          __schema {
            queryType {
              name
            }
          }
        }
      `
    });
    
    return !result.errors && result.data?.__schema?.queryType?.name === 'Query';
  } catch (error) {
    console.error('💥 GraphQL health check failed:', error);
    return false;
  }
};

export default createApolloServer;
