// api-gateway/src/graphql/server.ts - FIXED VERSION
// Complete Fixed GraphQL Server with proper Express middleware mounting

import { ApolloServer } from 'apollo-server-express';
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
    console.log('✅ GraphQL schema loaded from file');
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
        user(id: ID!): User
        users(limit: Int = 10, offset: Int = 0): [User!]!
        simulationJob(id: ID!): SimulationJob
        simulationJobs(limit: Int = 10, offset: Int = 0, status: JobStatus): [SimulationJob!]!
        topologyTemplates(limit: Int = 10, offset: Int = 0): [TopologyTemplate!]!
        workloadPatterns(limit: Int = 10, offset: Int = 0): [WorkloadPattern!]!
        searchJobs(query: String!, limit: Int = 10): [SimulationJob!]!
      }

      type Mutation {
        createSimulationJob(input: CreateSimulationJobInput!): SimulationJob!
        updateSimulationJobStatus(id: ID!, status: JobStatus!): SimulationJob!
        cancelSimulationJob(id: ID!): SimulationJob!
      }

      type Subscription {
        jobUpdated(jobId: ID!): SimulationJob!
        userJobsUpdated(userId: ID!): SimulationJob!
      }
    `;
  }
  
  return typeDefs;
};

// Create GraphQL context with authentication
const createGraphQLContext = ({ req }: { req?: any } = {}): GraphQLContext => {
  const context: GraphQLContext = {
    db: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  };

  // Handle cases where req might be undefined (like health checks)
  if (!req || !req.headers) {
    return context;
  }

  // Extract and verify JWT token
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded: any = jwt.verify(token, jwtSecret);
        context.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role || 'user'
        };
      }
    } catch (error) {
      console.warn('⚠️ Invalid JWT token in GraphQL context');
    }
  }

  return context;
};

// Create Apollo Server with proper configuration for apollo-server-express
const createApolloServer = () => {
  try {
    const typeDefs = createGraphQLSchema();
    
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      context: createGraphQLContext,
      introspection: true, // Enable for development
      // playground: true,    // Enable GraphQL Playground
      formatError: (error: any) => {
        console.error('🔥 GraphQL Error:', error.message);
        return {
          message: error.message,
          locations: error.locations,
          path: error.path,
          extensions: process.env.NODE_ENV !== 'production' ? error.extensions : {}
        };
      }
    });
    
    console.log('✅ Apollo Server created successfully');
    return server;
    
  } catch (error: any) {
    console.error('💥 Failed to create Apollo Server:', error);
    throw error;
  }
};

// Health check for GraphQL endpoint
const graphqlHealthCheck = async (apolloServer: any): Promise<boolean> => {
  try {
    // Simple introspection query to test GraphQL
    const result = await apolloServer.executeOperation({
      query: `
        query HealthCheck {
          __schema {
            queryType {
              name
            }
          }
        }
      `,
      // Provide empty context for health check
      context: createGraphQLContext()
    });
    
    const isHealthy = !result.errors && result.data?.__schema?.queryType?.name === 'Query';
    console.log(`🏥 GraphQL health check: ${isHealthy ? 'PASS' : 'FAIL'}`);
    
    if (result.errors) {
      console.error('🔥 GraphQL health check errors:', result.errors);
    }
    
    return isHealthy;
  } catch (error: any) {
    console.error('💥 GraphQL health check failed:', error.message);
    return false;
  }
};

// Export functions
export { createApolloServer, graphqlHealthCheck };
export default createApolloServer;