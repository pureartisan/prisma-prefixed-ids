import { beforeAll, afterAll, beforeEach, describe, it, expect, jest } from '@jest/globals';
import { PrismaClient } from './client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { extendPrismaClient } from '../src/index';

// Mock nanoid to avoid ESM issues and ensure unique IDs
let globalCounter = 1;
jest.mock('nanoid', () => ({
  customAlphabet: jest.fn().mockImplementation(() => {
    return () => `test_id_${globalCounter++}_${Date.now()}`;
  }),
}));

// Integration tests with real SQLite database
describe('Integration Tests - Prisma Prefixed IDs', () => {
  let prisma: PrismaClient;
  let extendedPrisma: ReturnType<typeof extendPrismaClient<any>>;
  const testRunId = Date.now().toString();

  beforeAll(async () => {
    const adapter = new PrismaLibSql({ url: 'file:tests/db/test.db' });
    prisma = new PrismaClient({ adapter } as any);
    await prisma.$connect();

    // Extend Prisma client with prefixed IDs after connection
    extendedPrisma = extendPrismaClient(prisma, {
      prefixes: {
        User: "usr",
        Post: "pst",
        Category: "cat",
        Comment: "cmt",
        Like: "lik",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.like.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.post.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Basic Operations', () => {
    it('should create a user with prefixed ID', async () => {
      const user = await extendedPrisma.user.create({
        data: {
          name: `John Doe ${testRunId}`,
          email: `john-${testRunId}@example.com`,
        },
      });

      expect(user.id).toMatch(/^usr_/);
      expect(user.name).toBe(`John Doe ${testRunId}`);
      expect(user.email).toBe(`john-${testRunId}@example.com`);
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should create multiple users with different prefixed IDs', async () => {
      const users = await extendedPrisma.user.createMany({
        data: [
          { name: `User 1 ${testRunId}`, email: `user1-${testRunId}@example.com` },
          { name: `User 2 ${testRunId}`, email: `user2-${testRunId}@example.com` },
          { name: `User 3 ${testRunId}`, email: `user3-${testRunId}@example.com` },
        ],
      });

      expect(users.count).toBe(3);

      // Verify all users have prefixed IDs
      const allUsers = await prisma.user.findMany();
      expect(allUsers).toHaveLength(3);
      allUsers.forEach(user => {
        expect(user.id).toMatch(/^usr_/);
      });
    });
  });

  describe('Nested Writes - Single Level', () => {
    it('should create user with nested posts', async () => {
      const userWithPosts = await extendedPrisma.user.create({
        data: {
          name: `Jane Doe ${testRunId}`,
          email: `jane-${testRunId}@example.com`,
          posts: {
            create: [
              {
                title: 'First Post',
                content: 'This is my first post',
                published: true,
              },
              {
                title: 'Second Post',
                content: 'This is my second post',
                published: false,
              },
            ],
          },
        },
        include: {
          posts: true,
        },
      });

      expect(userWithPosts.id).toMatch(/^usr_/);
      expect(userWithPosts.posts).toHaveLength(2);
      
      userWithPosts.posts.forEach((post: any) => {
        expect(post.id).toMatch(/^pst_/);
        expect(post.authorId).toBe(userWithPosts.id);
      });

      // Verify posts exist in database
      const postsInDb = await prisma.post.findMany();
      expect(postsInDb).toHaveLength(2);
      postsInDb.forEach(post => {
        expect(post.id).toMatch(/^pst_/);
      });
    });

    it('should create user with nested createMany posts', async () => {
      const userWithPosts = await extendedPrisma.user.create({
        data: {
          name: 'Bob Smith',
          email: 'bob@example.com',
          posts: {
            createMany: {
              data: [
                { title: 'Post A', content: 'Content A' },
                { title: 'Post B', content: 'Content B' },
                { title: 'Post C', content: 'Content C' },
              ],
            },
          },
        },
      });

      expect(userWithPosts.id).toMatch(/^usr_/);

      // Check posts were created with correct IDs
      const posts = await prisma.post.findMany({
        where: { authorId: userWithPosts.id },
      });

      expect(posts).toHaveLength(3);
      posts.forEach(post => {
        expect(post.id).toMatch(/^pst_/);
        expect(post.authorId).toBe(userWithPosts.id);
      });
    });
  });

  describe('Nested Writes - Multiple Levels', () => {
    it('should create user with posts, categories, and comments', async () => {
      const complexUser = await extendedPrisma.user.create({
        data: {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          posts: {
            create: {
              title: 'Complex Post',
              content: 'A post with categories and comments',
              published: true,
              categories: {
                create: [
                  { name: 'Technology' },
                  { name: 'Programming' },
                ],
              },
              comments: {
                create: [
                  {
                    content: 'Great post!',
                    author: {
                      create: {
                        name: 'Commenter 1',
                        email: 'commenter1@example.com',
                      },
                    },
                  },
                  {
                    content: 'Very informative',
                    author: {
                      create: {
                        name: 'Commenter 2', 
                        email: 'commenter2@example.com',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
              comments: {
                include: {
                  author: true,
                },
              },
            },
          },
        },
      });

      // Verify user ID
      expect(complexUser.id).toMatch(/^usr_/);
      expect(complexUser.posts).toHaveLength(1);

      const post = complexUser.posts[0];
      expect(post.id).toMatch(/^pst_/);

      // Verify categories
      expect(post.categories).toHaveLength(2);
      post.categories.forEach((category: any) => {
        expect(category.id).toMatch(/^cat_/);
      });

      // Verify comments and their authors
      expect(post.comments).toHaveLength(2);
      post.comments.forEach((comment: any) => {
        expect(comment.id).toMatch(/^cmt_/);
        expect(comment.author.id).toMatch(/^usr_/);
      });

      // Verify all data exists in database
      const totalUsers = await prisma.user.count();
      const totalPosts = await prisma.post.count();
      const totalCategories = await prisma.category.count();
      const totalComments = await prisma.comment.count();

      expect(totalUsers).toBe(3); // Original user + 2 comment authors
      expect(totalPosts).toBe(1);
      expect(totalCategories).toBe(2);
      expect(totalComments).toBe(2);
    });

    it('should create deeply nested structure with likes', async () => {
      const deepStructure = await extendedPrisma.user.create({
        data: {
          name: 'Deep User',
          email: 'deep@example.com',
          posts: {
            create: {
              title: 'Post with Likes',
              content: 'A post that will have comments with likes',
              published: true,
              comments: {
                create: {
                  content: 'This comment will have likes',
                  author: {
                    create: {
                      name: 'Comment Author',
                      email: 'comment.author@example.com',
                    },
                  },
                  likes: {
                    create: [
                      { type: 'like' },
                      { type: 'love' },
                      { type: 'laugh' },
                    ],
                  },
                },
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              comments: {
                include: {
                  likes: true,
                  author: true,
                },
              },
            },
          },
        },
      });

      // Verify IDs at all levels
      expect(deepStructure.id).toMatch(/^usr_/);
      
      const post = deepStructure.posts[0];
      expect(post.id).toMatch(/^pst_/);
      
      const comment = post.comments[0];
      expect(comment.id).toMatch(/^cmt_/);
      expect(comment.author.id).toMatch(/^usr_/);
      
      expect(comment.likes).toHaveLength(3);
      comment.likes.forEach((like: any) => {
        expect(like.id).toMatch(/^lik_/);
        expect(like.commentId).toBe(comment.id);
      });

      // Verify all likes exist in database
      const likesInDb = await prisma.like.findMany();
      expect(likesInDb).toHaveLength(3);
      likesInDb.forEach(like => {
        expect(like.id).toMatch(/^lik_/);
      });
    });
  });

  describe('Update Operations with Nested Creates', () => {
    it('should update user and create new nested posts', async () => {
      // First create a user
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Update User',
          email: 'update@example.com',
        },
      });

      // Then update the user and add new posts
      const updatedUser = await extendedPrisma.user.update({
        where: { id: user.id },
        data: {
          name: 'Updated User Name',
          posts: {
            create: [
              {
                title: 'New Post 1',
                content: 'Content for new post 1',
              },
              {
                title: 'New Post 2',
                content: 'Content for new post 2',
              },
            ],
          },
        },
        include: {
          posts: true,
        },
      });

      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.name).toBe('Updated User Name');
      expect(updatedUser.posts).toHaveLength(2);
      
      updatedUser.posts.forEach((post: any) => {
        expect(post.id).toMatch(/^pst_/);
        expect(post.authorId).toBe(user.id);
      });
    });

    it('should use upsert with nested creates', async () => {
      const upsertedUser = await extendedPrisma.user.upsert({
        where: { email: 'upsert@example.com' },
        create: {
          name: 'Upsert User',
          email: 'upsert@example.com',
          posts: {
            create: {
              title: 'Upsert Post',
              content: 'Content from upsert create',
            },
          },
        },
        update: {
          name: 'Updated Upsert User',
        },
        include: {
          posts: true,
        },
      });

      expect(upsertedUser.id).toMatch(/^usr_/);
      expect(upsertedUser.name).toBe('Upsert User');
      expect(upsertedUser.posts).toHaveLength(1);
      expect(upsertedUser.posts[0].id).toMatch(/^pst_/);

      // Try upsert again with same email - should update
      const secondUpsert = await extendedPrisma.user.upsert({
        where: { email: 'upsert@example.com' },
        create: {
          name: 'Should not be used',
          email: 'upsert@example.com',
        },
        update: {
          name: 'Actually Updated',
        },
      });

      expect(secondUpsert.id).toBe(upsertedUser.id);
      expect(secondUpsert.name).toBe('Actually Updated');
    });

    it('should handle upsert with nested creates inside update branch', async () => {
      // First create a user with a post
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Upsert Update User',
          email: 'upsert-update@example.com',
          posts: {
            create: {
              title: 'Existing Post',
              content: 'Existing content',
            },
          },
        },
        include: { posts: true },
      });

      const existingPostId = user.posts[0].id;

      // Now upsert with a nested create inside the update branch
      const upsertedUser = await extendedPrisma.user.upsert({
        where: { email: 'upsert-update@example.com' },
        create: {
          name: 'Should not be used',
          email: 'upsert-update@example.com',
        },
        update: {
          name: 'Updated Name',
          posts: {
            create: {
              title: 'New Post From Update',
              content: 'Created inside upsert update branch',
            },
          },
        },
        include: {
          posts: true,
        },
      });

      // Should have updated, not created
      expect(upsertedUser.id).toBe(user.id);
      expect(upsertedUser.name).toBe('Updated Name');
      // Should have 2 posts now - the original and the new one
      expect(upsertedUser.posts).toHaveLength(2);
      const newPost = upsertedUser.posts.find((p: any) => p.id !== existingPostId);
      expect(newPost).toBeDefined();
      expect(newPost!.id).toMatch(/^pst_/);
      expect(newPost!.title).toBe('New Post From Update');
    });

    it('should handle array upsert on nested relations', async () => {
      // Create a user first
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Array Upsert User',
          email: 'array-upsert@example.com',
        },
      });

      // Create one existing post
      const existingPost = await extendedPrisma.post.create({
        data: {
          title: 'Existing Post',
          content: 'Existing content',
          authorId: user.id,
        },
      });

      // Update user with array upsert on posts
      const updatedUser = await extendedPrisma.user.update({
        where: { id: user.id },
        data: {
          posts: {
            upsert: [
              {
                where: { id: existingPost.id },
                create: { title: 'Should Not Create 1', content: 'x' },
                update: { title: 'Updated Existing Post' },
              },
              {
                where: { id: 'pst_nonexistent' },
                create: { title: 'Newly Created Post', content: 'new' },
                update: { title: 'Should Not Update' },
              },
            ],
          },
        },
        include: {
          posts: true,
        },
      });

      expect(updatedUser.posts).toHaveLength(2);

      const updated = updatedUser.posts.find((p: any) => p.id === existingPost.id);
      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated Existing Post');

      const created = updatedUser.posts.find((p: any) => p.id !== existingPost.id);
      expect(created).toBeDefined();
      expect(created!.id).toMatch(/^pst_/);
      expect(created!.title).toBe('Newly Created Post');
    });
  });

  describe('ConnectOrCreate Operations', () => {
    it('should handle connectOrCreate with nested structures', async () => {
      // First create a category
      const existingCategory = await extendedPrisma.category.create({
        data: {
          name: 'Existing Category',
        },
      });

      const userWithPost = await extendedPrisma.user.create({
        data: {
          name: 'ConnectOrCreate User',
          email: 'connectorcreate@example.com',
          posts: {
            create: {
              title: 'Post with ConnectOrCreate',
              content: 'Testing connectOrCreate functionality',
              categories: {
                connectOrCreate: [
                  {
                    where: { name: 'Existing Category' },
                    create: { name: 'Should not be created' },
                  },
                  {
                    where: { name: 'New Category' },
                    create: { name: 'New Category' },
                  },
                ],
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
            },
          },
        },
      });

      expect(userWithPost.id).toMatch(/^usr_/);
      
      const post = userWithPost.posts[0];
      expect(post.id).toMatch(/^pst_/);
      expect(post.categories).toHaveLength(2);

      // One should be the existing category, one should be newly created
      const existingConnected = post.categories.find((cat: any) => cat.id === existingCategory.id);
      const newlyCreated = post.categories.find((cat: any) => cat.id !== existingCategory.id);

      expect(existingConnected).toBeDefined();
      expect(existingConnected!.name).toBe('Existing Category');

      expect(newlyCreated).toBeDefined();
      expect(newlyCreated!.id).toMatch(/^cat_/);
      expect(newlyCreated!.name).toBe('New Category');

      // Verify total categories in database
      const totalCategories = await prisma.category.count();
      expect(totalCategories).toBe(2); // Should not have created a duplicate
    });

    it('should handle single-object connectOrCreate on nested relations', async () => {
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Single ConnectOrCreate User',
          email: 'single-connectorcreate@example.com',
          posts: {
            create: {
              title: 'Post with single ConnectOrCreate',
              content: 'Testing single connectOrCreate',
              categories: {
                connectOrCreate: {
                  where: { name: 'Brand New Category' },
                  create: { name: 'Brand New Category' },
                },
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
            },
          },
        },
      });

      expect(user.id).toMatch(/^usr_/);

      const post = user.posts[0];
      expect(post.id).toMatch(/^pst_/);
      expect(post.categories).toHaveLength(1);
      expect(post.categories[0].id).toMatch(/^cat_/);
      expect(post.categories[0].name).toBe('Brand New Category');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty nested creates', async () => {
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Empty Nested User',
          email: 'empty@example.com',
          posts: {
            createMany: {
              data: [], // Empty array
            },
          },
        },
        include: {
          posts: true,
        },
      });

      expect(user.id).toMatch(/^usr_/);
      expect(user.posts).toHaveLength(0);
    });

    it('should preserve existing IDs when provided', async () => {
      const customId = 'custom_user_id';
      const user = await extendedPrisma.user.create({
        data: {
          id: customId,
          name: 'Custom ID User',
          email: 'custom@example.com',
        },
      });

      expect(user.id).toBe(customId);
      expect(user.name).toBe('Custom ID User');
    });

    it('should handle mixed operations correctly', async () => {
      // Create initial data
      const category1 = await extendedPrisma.category.create({
        data: { name: 'Category 1' },
      });
      
      const category2 = await extendedPrisma.category.create({
        data: { name: 'Category 2' },
      });

      // Create user with post that connects to existing categories and creates new ones
      const user = await extendedPrisma.user.create({
        data: {
          name: 'Mixed Operations User',
          email: 'mixed@example.com',
          posts: {
            create: {
              title: 'Mixed Operations Post',
              content: 'Testing mixed operations',
              categories: {
                connect: [
                  { id: category1.id },
                ],
                create: [
                  { name: 'New Category from Mixed' },
                ],
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
            },
          },
        },
      });

      expect(user.id).toMatch(/^usr_/);
      
      const post = user.posts[0];
      expect(post.id).toMatch(/^pst_/);
      expect(post.categories).toHaveLength(2);

      // Check that one is the connected existing category
      const connectedCategory = post.categories.find((cat: any) => cat.id === category1.id);
      expect(connectedCategory).toBeDefined();

      // Check that one is newly created
      const newCategory = post.categories.find((cat: any) => cat.id !== category1.id);
      expect(newCategory).toBeDefined();
      expect(newCategory!.id).toMatch(/^cat_/);
      expect(newCategory!.name).toBe('New Category from Mixed');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle bulk operations efficiently', async () => {
      const bulkData = Array.from({ length: 50 }, (_, i) => ({
        name: `Bulk User ${i + 1}`,
        email: `bulk${i + 1}@example.com`,
      }));

      const result = await extendedPrisma.user.createMany({
        data: bulkData,
      });

      expect(result.count).toBe(50);

      // Verify all have prefixed IDs
      const allUsers = await prisma.user.findMany();
      expect(allUsers).toHaveLength(50);
      allUsers.forEach(user => {
        expect(user.id).toMatch(/^usr_/);
        expect(user.name).toMatch(/^Bulk User \d+$/);
      });
    });

    it('should handle complex nested operations with good performance', async () => {
      const startTime = Date.now();

      const complexUser = await extendedPrisma.user.create({
        data: {
          name: 'Performance Test User',
          email: 'performance@example.com',
          posts: {
            createMany: {
              data: Array.from({ length: 10 }, (_, i) => ({
                title: `Performance Post ${i + 1}`,
                content: `Content for post ${i + 1}`,
                published: i % 2 === 0,
              })),
            },
          },
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(complexUser.id).toMatch(/^usr_/);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all posts were created
      const posts = await prisma.post.findMany({
        where: { authorId: complexUser.id },
      });

      expect(posts).toHaveLength(10);
      posts.forEach(post => {
        expect(post.id).toMatch(/^pst_/);
      });
    });
  });

  describe('Transaction Support', () => {
    it('should work correctly within an interactive transaction with single create', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            name: 'Transaction User',
            email: 'transaction@example.com',
          },
        });

        return user;
      });

      expect(result.id).toMatch(/^usr_/);
      expect(result.name).toBe('Transaction User');

      // Verify it was actually saved
      const savedUser = await prisma.user.findUnique({
        where: { id: result.id },
      });
      expect(savedUser).not.toBeNull();
      expect(savedUser!.id).toBe(result.id);
    });

    it('should work correctly within an interactive transaction with multiple creates', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user1 = await tx.user.create({
          data: {
            name: 'Transaction User 1',
            email: 'tx1@example.com',
          },
        });

        const user2 = await tx.user.create({
          data: {
            name: 'Transaction User 2',
            email: 'tx2@example.com',
          },
        });

        const post = await tx.post.create({
          data: {
            title: 'Transaction Post',
            content: 'Created in transaction',
            authorId: user1.id,
          },
        });

        return { user1, user2, post };
      });

      expect(result.user1.id).toMatch(/^usr_/);
      expect(result.user2.id).toMatch(/^usr_/);
      expect(result.post.id).toMatch(/^pst_/);
      expect(result.user1.id).not.toBe(result.user2.id);

      // Verify all were saved
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: [result.user1.id, result.user2.id],
          },
        },
      });
      expect(users).toHaveLength(2);

      const post = await prisma.post.findUnique({
        where: { id: result.post.id },
      });
      expect(post).not.toBeNull();
      expect(post!.authorId).toBe(result.user1.id);
    });

    it('should work with nested creates within a transaction', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            name: 'Nested Transaction User',
            email: 'nested-tx@example.com',
            posts: {
              create: [
                {
                  title: 'Transaction Post 1',
                  content: 'First post in transaction',
                  categories: {
                    create: [
                      { name: 'TX Category 1' },
                      { name: 'TX Category 2' },
                    ],
                  },
                },
                {
                  title: 'Transaction Post 2',
                  content: 'Second post in transaction',
                },
              ],
            },
          },
          include: {
            posts: {
              include: {
                categories: true,
              },
            },
          },
        });

        return user;
      });

      expect(result.id).toMatch(/^usr_/);
      expect(result.posts).toHaveLength(2);
      result.posts.forEach((post: any) => {
        expect(post.id).toMatch(/^pst_/);
        expect(post.authorId).toBe(result.id);
      });

      expect(result.posts[0].categories).toHaveLength(2);
      result.posts[0].categories.forEach((category: any) => {
        expect(category.id).toMatch(/^cat_/);
      });

      // Verify in database
      const savedUser = await prisma.user.findUnique({
        where: { id: result.id },
        include: {
          posts: {
            include: {
              categories: true,
            },
          },
        },
      });

      expect(savedUser).not.toBeNull();
      expect(savedUser!.posts).toHaveLength(2);
    });

    it('should work with createMany within a transaction', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const users = await tx.user.createMany({
          data: [
            { name: 'Bulk TX User 1', email: 'bulktx1@example.com' },
            { name: 'Bulk TX User 2', email: 'bulktx2@example.com' },
            { name: 'Bulk TX User 3', email: 'bulktx3@example.com' },
          ],
        });

        return users;
      });

      expect(result.count).toBe(3);

      // Verify all have prefixed IDs
      const allUsers = await prisma.user.findMany({
        where: {
          email: {
            contains: 'bulktx',
          },
        },
      });

      expect(allUsers).toHaveLength(3);
      allUsers.forEach(user => {
        expect(user.id).toMatch(/^usr_/);
      });
    });

    it('should handle large batch creates within a transaction', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const bulkData = Array.from({ length: 100 }, (_, i) => ({
          name: `Batch TX User ${i + 1}`,
          email: `batchtx${i + 1}@example.com`,
        }));

        const users = await tx.user.createMany({
          data: bulkData,
        });

        return users;
      });

      expect(result.count).toBe(100);

      // Verify all have prefixed IDs
      const allUsers = await prisma.user.findMany({
        where: {
          email: {
            contains: 'batchtx',
          },
        },
      });

      expect(allUsers).toHaveLength(100);
      allUsers.forEach(user => {
        expect(user.id).toMatch(/^usr_/);
      });
    });

    it('should properly rollback on transaction failure', async () => {
      let userId: string | null = null;

      try {
        await extendedPrisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              name: 'Rollback Test User',
              email: 'rollback@example.com',
            },
          });

          userId = user.id;
          expect(user.id).toMatch(/^usr_/);

          // Force an error by trying to create duplicate email
          await tx.user.create({
            data: {
              name: 'Duplicate User',
              email: 'rollback@example.com', // Same email
            },
          });
        });
      } catch (error) {
        // Expected to fail due to unique constraint
      }

      // Verify the user was NOT saved due to rollback
      if (userId) {
        const savedUser = await prisma.user.findUnique({
          where: { id: userId },
        });
        expect(savedUser).toBeNull();
      }

      const userByEmail = await prisma.user.findUnique({
        where: { email: 'rollback@example.com' },
      });
      expect(userByEmail).toBeNull();
    });

    it('should work with deeply nested creates in a transaction', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            name: 'Deep TX User',
            email: 'deeptx@example.com',
            posts: {
              create: {
                title: 'Deep TX Post',
                content: 'Deep nested transaction test',
                categories: {
                  create: [
                    { name: 'Deep TX Category 1' },
                    { name: 'Deep TX Category 2' },
                  ],
                },
                comments: {
                  create: {
                    content: 'Deep TX Comment',
                    author: {
                      create: {
                        name: 'Comment Author TX',
                        email: 'commentauthor-tx@example.com',
                      },
                    },
                    likes: {
                      create: [
                        { type: 'like' },
                        { type: 'love' },
                      ],
                    },
                  },
                },
              },
            },
          },
          include: {
            posts: {
              include: {
                categories: true,
                comments: {
                  include: {
                    author: true,
                    likes: true,
                  },
                },
              },
            },
          },
        });

        return user;
      });

      expect(result.id).toMatch(/^usr_/);
      expect(result.posts).toHaveLength(1);

      const post = result.posts[0];
      expect(post.id).toMatch(/^pst_/);
      expect(post.categories).toHaveLength(2);
      post.categories.forEach((cat: any) => {
        expect(cat.id).toMatch(/^cat_/);
      });

      expect(post.comments).toHaveLength(1);
      const comment = post.comments[0];
      expect(comment.id).toMatch(/^cmt_/);
      expect(comment.author.id).toMatch(/^usr_/);
      expect(comment.likes).toHaveLength(2);
      comment.likes.forEach((like: any) => {
        expect(like.id).toMatch(/^lik_/);
      });

      // Verify everything was saved
      const totalUsers = await prisma.user.count();
      expect(totalUsers).toBeGreaterThanOrEqual(2); // Main user + comment author
    });

    it('should work with mixed operations in a transaction', async () => {
      // First create some initial data
      const initialUser = await extendedPrisma.user.create({
        data: {
          name: 'Initial User',
          email: 'initial-mixed@example.com',
        },
      });

      const initialPost = await extendedPrisma.post.create({
        data: {
          title: 'Initial Post',
          content: 'Initial content',
          authorId: initialUser.id,
        },
      });

      // Now perform mixed operations in a transaction
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        // Create a new user
        const newUser = await tx.user.create({
          data: {
            name: 'Mixed TX User',
            email: 'mixed-tx@example.com',
          },
        });

        // Update the existing post
        const updatedPost = await tx.post.update({
          where: { id: initialPost.id },
          data: {
            title: 'Updated in Transaction',
            comments: {
              create: {
                content: 'Comment from transaction',
                authorId: newUser.id,
              },
            },
          },
          include: {
            comments: true,
          },
        });

        // Create a new post for the new user
        const newPost = await tx.post.create({
          data: {
            title: 'New Post in TX',
            authorId: newUser.id,
          },
        });

        return { newUser, updatedPost, newPost };
      });

      expect(result.newUser.id).toMatch(/^usr_/);
      expect(result.newPost.id).toMatch(/^pst_/);
      expect(result.updatedPost.id).toBe(initialPost.id);
      expect(result.updatedPost.comments).toHaveLength(1);
      expect(result.updatedPost.comments[0].id).toMatch(/^cmt_/);
    });

    it('should handle sequential transactions correctly', async () => {
      const tx1Result = await extendedPrisma.$transaction(async (tx: any) => {
        return await tx.user.create({
          data: {
            name: 'Sequential TX 1',
            email: 'seqtx1@example.com',
          },
        });
      });

      const tx2Result = await extendedPrisma.$transaction(async (tx: any) => {
        return await tx.user.create({
          data: {
            name: 'Sequential TX 2',
            email: 'seqtx2@example.com',
          },
        });
      });

      expect(tx1Result.id).toMatch(/^usr_/);
      expect(tx2Result.id).toMatch(/^usr_/);
      expect(tx1Result.id).not.toBe(tx2Result.id);

      // Both should be saved
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: [tx1Result.id, tx2Result.id],
          },
        },
      });
      expect(users).toHaveLength(2);
    });

    it('should work with upsert operations in a transaction', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user = await tx.user.upsert({
          where: { email: 'upsert-tx@example.com' },
          create: {
            name: 'Upsert TX User',
            email: 'upsert-tx@example.com',
            posts: {
              create: {
                title: 'Upsert TX Post',
                content: 'Created via upsert in transaction',
              },
            },
          },
          update: {
            name: 'Updated in TX',
          },
          include: {
            posts: true,
          },
        });

        return user;
      });

      expect(result.id).toMatch(/^usr_/);
      expect(result.name).toBe('Upsert TX User');
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toMatch(/^pst_/);

      // Verify it was saved
      const savedUser = await prisma.user.findUnique({
        where: { id: result.id },
        include: { posts: true },
      });
      expect(savedUser).not.toBeNull();
      expect(savedUser!.posts).toHaveLength(1);
    });

    it('should preserve manual IDs within transactions', async () => {
      const result = await extendedPrisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            id: 'manual_tx_user',
            name: 'Manual ID TX User',
            email: 'manual-tx@example.com',
            posts: {
              create: {
                id: 'manual_tx_post',
                title: 'Manual ID TX Post',
                content: 'With manual ID in transaction',
              },
            },
          },
          include: {
            posts: true,
          },
        });

        return user;
      });

      expect(result.id).toBe('manual_tx_user');
      expect(result.posts[0].id).toBe('manual_tx_post');

      // Verify in database
      const savedUser = await prisma.user.findUnique({
        where: { id: 'manual_tx_user' },
      });
      expect(savedUser).not.toBeNull();

      const savedPost = await prisma.post.findUnique({
        where: { id: 'manual_tx_post' },
      });
      expect(savedPost).not.toBeNull();
    });

    it('should timeout when using wrong transaction pattern (demonstrates the bug)', async () => {
      // This test demonstrates the bug: using prisma.$transaction with extendedPrisma inside
      // will cause the transaction to hang and timeout

      const transactionPromise = prisma.$transaction(async (tx: any) => {
        // WRONG: Using extendedPrisma inside prisma.$transaction
        // This will hang because extendedPrisma operations are not aware of the tx context
        const user = await extendedPrisma.user.create({
          data: {
            name: 'Wrong Pattern User',
            email: 'wrong-pattern-hang@example.com',
          },
        });
        return user;
      }, {
        timeout: 2000, // 2 second timeout
      });

      let didError = false;
      let errorMessage = '';

      try {
        await transactionPromise;
      } catch (error: any) {
        didError = true;
        errorMessage = error.message;
      }

      // Should have timed out
      expect(didError).toBe(true);
      expect(errorMessage.toLowerCase()).toContain('transaction');

      // Verify nothing was created due to timeout
      const user = await prisma.user.findUnique({
        where: { email: 'wrong-pattern-hang@example.com' },
      });
      // User might exist if created before timeout, but transaction didn't complete properly
      // This demonstrates the unreliable behavior of the wrong pattern
    }, 15000); // Give test 15 seconds to complete including timeout handling

    it('should demonstrate correct vs incorrect transaction patterns', async () => {
      // Pattern 1: CORRECT - Use extendedPrisma.$transaction with tx client
      try {
        await extendedPrisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              name: 'Correct Pattern User',
              email: 'correct-pattern@example.com',
            },
          });

          // Force an error to trigger rollback
          throw new Error('Intentional error for rollback test');
        });
      } catch (error) {
        // Expected to throw
      }

      // User should NOT exist due to rollback
      const correctUser = await prisma.user.findUnique({
        where: { email: 'correct-pattern@example.com' },
      });
      expect(correctUser).toBeNull();

      // Pattern 2: INCORRECT - Attempting to use base prisma for transaction
      // This will timeout, so we use a shorter timeout
      let incorrectPatternFailed = false;
      try {
        await prisma.$transaction(async (tx: any) => {
          const user = await extendedPrisma.user.create({
            data: {
              name: 'Incorrect Pattern User',
              email: 'incorrect-pattern@example.com',
            },
          });

          throw new Error('Should not reach here');
        }, {
          timeout: 2000,
        });
      } catch (error: any) {
        incorrectPatternFailed = true;
        // Expected to timeout or fail
      }

      expect(incorrectPatternFailed).toBe(true);
    }, 15000);
  });

  describe("Manual ID Preservation", () => {
    it("should preserve manually set ID in create operation", async () => {
      const user = await extendedPrisma.user.create({
        data: {
          id: "my_custom_user_id",
          name: `Custom User ${testRunId}`,
          email: `custom-${testRunId}@example.com`,
        },
      });

      expect(user.id).toBe("my_custom_user_id");
      expect(user.name).toBe(`Custom User ${testRunId}`);
      expect(user.email).toBe(`custom-${testRunId}@example.com`);

      // Verify it exists in database with custom ID
      const foundUser = await prisma.user.findUnique({
        where: { id: "my_custom_user_id" },
      });
      expect(foundUser).not.toBeNull();
      expect(foundUser!.id).toBe("my_custom_user_id");
    });

    it("should preserve manually set IDs in createMany operation", async () => {
      const result = await extendedPrisma.user.createMany({
        data: [
          {
            id: "manual_id_1",
            name: `Manual User 1 ${testRunId}`,
            email: `manual1-${testRunId}@example.com`,
          },
          {
            name: `Auto User 2 ${testRunId}`,
            email: `auto2-${testRunId}@example.com`,
          },
          {
            id: "manual_id_3",
            name: `Manual User 3 ${testRunId}`,
            email: `manual3-${testRunId}@example.com`,
          },
        ],
      });

      expect(result.count).toBe(3);

      // Verify manual IDs were preserved
      const manualUser1 = await prisma.user.findUnique({
        where: { id: "manual_id_1" },
      });
      expect(manualUser1).not.toBeNull();
      expect(manualUser1!.name).toBe(`Manual User 1 ${testRunId}`);

      const manualUser3 = await prisma.user.findUnique({
        where: { id: "manual_id_3" },
      });
      expect(manualUser3).not.toBeNull();
      expect(manualUser3!.name).toBe(`Manual User 3 ${testRunId}`);

      // Verify auto-generated ID has correct prefix
      const autoUser = await prisma.user.findUnique({
        where: { email: `auto2-${testRunId}@example.com` },
      });
      expect(autoUser).not.toBeNull();
      expect(autoUser!.id).toMatch(/^usr_/);
    });

    it("should preserve manually set ID in upsert create branch", async () => {
      const user = await extendedPrisma.user.upsert({
        where: { email: `upsert-manual-${testRunId}@example.com` },
        create: {
          id: "my_upsert_manual_id",
          name: `Upsert Manual User ${testRunId}`,
          email: `upsert-manual-${testRunId}@example.com`,
        },
        update: {
          name: "Should not be used",
        },
      });

      expect(user.id).toBe("my_upsert_manual_id");
      expect(user.name).toBe(`Upsert Manual User ${testRunId}`);

      // Verify it exists in database
      const foundUser = await prisma.user.findUnique({
        where: { id: "my_upsert_manual_id" },
      });
      expect(foundUser).not.toBeNull();
    });

    it("should preserve manually set IDs in deeply nested create operations", async () => {
      const complexUser = await extendedPrisma.user.create({
        data: {
          id: "manual_user_complex",
          name: `Complex Manual User ${testRunId}`,
          email: `complex-manual-${testRunId}@example.com`,
          posts: {
            create: {
              id: "manual_post_id",
              title: "Manual Post Title",
              content: "This post has a manual ID",
              published: true,
              categories: {
                create: [
                  {
                    id: "manual_category_1",
                    name: "Manual Category 1",
                  },
                  {
                    name: "Auto Category 2", // This should get auto-generated ID
                  },
                ],
              },
              comments: {
                create: {
                  id: "manual_comment_id",
                  content: "Manual comment with manual ID",
                  author: {
                    create: {
                      id: "manual_comment_author",
                      name: "Manual Comment Author",
                      email: `comment-author-manual-${testRunId}@example.com`,
                    },
                  },
                  likes: {
                    create: [
                      {
                        id: "manual_like_1",
                        type: "like",
                      },
                      {
                        type: "love", // Auto-generated ID
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
              comments: {
                include: {
                  author: true,
                  likes: true,
                },
              },
            },
          },
        },
      });

      // Verify all manual IDs were preserved
      expect(complexUser.id).toBe("manual_user_complex");

      const post = complexUser.posts[0];
      expect(post.id).toBe("manual_post_id");

      const manualCategory = post.categories.find(
        (cat: any) => cat.id === "manual_category_1",
      );
      expect(manualCategory).toBeDefined();
      expect(manualCategory!.name).toBe("Manual Category 1");

      const autoCategory = post.categories.find(
        (cat: any) => cat.id !== "manual_category_1",
      );
      expect(autoCategory).toBeDefined();
      expect(autoCategory!.id).toMatch(/^cat_/);

      const comment = post.comments[0];
      expect(comment.id).toBe("manual_comment_id");
      expect(comment.author.id).toBe("manual_comment_author");

      const manualLike = comment.likes.find(
        (like: any) => like.id === "manual_like_1",
      );
      expect(manualLike).toBeDefined();
      expect(manualLike!.type).toBe("like");

      const autoLike = comment.likes.find(
        (like: any) => like.id !== "manual_like_1",
      );
      expect(autoLike).toBeDefined();
      expect(autoLike!.id).toMatch(/^lik_/);

      // Verify all data exists in database with correct IDs
      const dbUser = await prisma.user.findUnique({
        where: { id: "manual_user_complex" },
      });
      expect(dbUser).not.toBeNull();

      const dbPost = await prisma.post.findUnique({
        where: { id: "manual_post_id" },
      });
      expect(dbPost).not.toBeNull();

      const dbCategory = await prisma.category.findUnique({
        where: { id: "manual_category_1" },
      });
      expect(dbCategory).not.toBeNull();

      const dbComment = await prisma.comment.findUnique({
        where: { id: "manual_comment_id" },
      });
      expect(dbComment).not.toBeNull();

      const dbCommentAuthor = await prisma.user.findUnique({
        where: { id: "manual_comment_author" },
      });
      expect(dbCommentAuthor).not.toBeNull();

      const dbLike = await prisma.like.findUnique({
        where: { id: "manual_like_1" },
      });
      expect(dbLike).not.toBeNull();
    });

    it("should preserve manually set IDs in createMany nested operations", async () => {
      const user = await extendedPrisma.user.create({
        data: {
          id: "user_with_many_posts",
          name: `User with Many Posts ${testRunId}`,
          email: `many-posts-${testRunId}@example.com`,
          posts: {
            createMany: {
              data: [
                {
                  id: "manual_post_1",
                  title: "Manual Post 1",
                  content: "First manual post",
                },
                {
                  title: "Auto Post 2",
                  content: "Second auto post",
                },
                {
                  id: "manual_post_3",
                  title: "Manual Post 3",
                  content: "Third manual post",
                },
              ],
            },
          },
        },
      });

      expect(user.id).toBe("user_with_many_posts");

      // Verify manual IDs were preserved in database
      const manualPost1 = await prisma.post.findUnique({
        where: { id: "manual_post_1" },
      });
      expect(manualPost1).not.toBeNull();
      expect(manualPost1!.title).toBe("Manual Post 1");
      expect(manualPost1!.authorId).toBe("user_with_many_posts");

      const manualPost3 = await prisma.post.findUnique({
        where: { id: "manual_post_3" },
      });
      expect(manualPost3).not.toBeNull();
      expect(manualPost3!.title).toBe("Manual Post 3");
      expect(manualPost3!.authorId).toBe("user_with_many_posts");

      // Verify auto-generated post has correct prefix
      const allPosts = await prisma.post.findMany({
        where: { authorId: "user_with_many_posts" },
      });
      expect(allPosts).toHaveLength(3);

      const autoPost = allPosts.find(
        (post) => post.id !== "manual_post_1" && post.id !== "manual_post_3",
      );
      expect(autoPost).toBeDefined();
      expect(autoPost!.id).toMatch(/^pst_/);
      expect(autoPost!.title).toBe("Auto Post 2");
    });

    it("should preserve manually set IDs in update operations with nested creates", async () => {
      // First create a user
      const user = await extendedPrisma.user.create({
        data: {
          id: "user_for_update_test",
          name: `Update Test User ${testRunId}`,
          email: `update-test-${testRunId}@example.com`,
        },
      });

      // Then update with nested creates that have manual IDs
      const updatedUser = await extendedPrisma.user.update({
        where: { id: "user_for_update_test" },
        data: {
          name: "Updated User Name",
          posts: {
            create: [
              {
                id: "manual_update_post_1",
                title: "Manual Update Post 1",
                content: "First manual update post",
              },
              {
                title: "Auto Update Post 2",
                content: "Second auto update post",
              },
            ],
          },
        },
        include: {
          posts: true,
        },
      });

      expect(updatedUser.id).toBe("user_for_update_test");
      expect(updatedUser.name).toBe("Updated User Name");
      expect(updatedUser.posts).toHaveLength(2);

      // Verify manual ID was preserved
      const manualPost = updatedUser.posts.find(
        (post: any) => post.id === "manual_update_post_1",
      );
      expect(manualPost).toBeDefined();
      expect(manualPost!.title).toBe("Manual Update Post 1");

      // Verify auto-generated ID has correct prefix
      const autoPost = updatedUser.posts.find(
        (post: any) => post.id !== "manual_update_post_1",
      );
      expect(autoPost).toBeDefined();
      expect(autoPost!.id).toMatch(/^pst_/);
      expect(autoPost!.title).toBe("Auto Update Post 2");

      // Verify in database
      const dbManualPost = await prisma.post.findUnique({
        where: { id: "manual_update_post_1" },
      });
      expect(dbManualPost).not.toBeNull();
      expect(dbManualPost!.authorId).toBe("user_for_update_test");
    });

    it("should handle edge cases with different ID types", async () => {
      // Test with numeric-like string ID
      const user1 = await extendedPrisma.user.create({
        data: {
          id: "123456",
          name: `Numeric-like ID User ${testRunId}`,
          email: `numeric-${testRunId}@example.com`,
        },
      });

      expect(user1.id).toBe("123456");

      // Test with special characters
      const user2 = await extendedPrisma.user.create({
        data: {
          id: "special_id_test-123",
          name: `Edge Case User ${testRunId}`,
          email: `edge-${testRunId}@example.com`,
        },
      });

      expect(user2.id).toBe("special_id_test-123");

      // Verify both exist in database
      const dbUser1 = await prisma.user.findUnique({ where: { id: "123456" } });
      expect(dbUser1).not.toBeNull();

      const dbUser2 = await prisma.user.findUnique({
        where: { id: "special_id_test-123" },
      });
      expect(dbUser2).not.toBeNull();
    });

    it("should work correctly in mixed scenarios with auto and manual IDs", async () => {
      const user = await extendedPrisma.user.create({
        data: {
          name: `Mixed Scenario User ${testRunId}`, // Auto-generated user ID
          email: `mixed-${testRunId}@example.com`,
          posts: {
            create: [
              {
                id: "manual_mixed_post_1",
                title: "Manual Post in Mixed Scenario",
                content: "This post has manual ID",
                categories: {
                  create: [
                    {
                      name: "Auto Category in Mixed", // Auto-generated category ID
                    },
                    {
                      id: "manual_mixed_category",
                      name: "Manual Category in Mixed",
                    },
                  ],
                },
              },
              {
                title: "Auto Post in Mixed Scenario", // Auto-generated post ID
                content: "This post has auto ID",
              },
            ],
          },
        },
        include: {
          posts: {
            include: {
              categories: true,
            },
          },
        },
      });

      // Verify user got auto-generated ID
      expect(user.id).toMatch(/^usr_/);
      expect(user.posts).toHaveLength(2);

      // Find manual and auto posts
      const manualPost = user.posts.find(
        (post: any) => post.id === "manual_mixed_post_1",
      );
      const autoPost = user.posts.find(
        (post: any) => post.id !== "manual_mixed_post_1",
      );

      expect(manualPost).toBeDefined();
      expect(manualPost!.title).toBe("Manual Post in Mixed Scenario");

      expect(autoPost).toBeDefined();
      expect(autoPost!.id).toMatch(/^pst_/);
      expect(autoPost!.title).toBe("Auto Post in Mixed Scenario");

      // Verify categories
      expect(manualPost!.categories).toHaveLength(2);
      const manualCategory = manualPost!.categories.find(
        (cat: any) => cat.id === "manual_mixed_category",
      );
      const autoCategory = manualPost!.categories.find(
        (cat: any) => cat.id !== "manual_mixed_category",
      );

      expect(manualCategory).toBeDefined();
      expect(manualCategory!.name).toBe("Manual Category in Mixed");

      expect(autoCategory).toBeDefined();
      expect(autoCategory!.id).toMatch(/^cat_/);
      expect(autoCategory!.name).toBe("Auto Category in Mixed");

      // Verify all exists in database
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser).not.toBeNull();

      const dbManualPost = await prisma.post.findUnique({
        where: { id: "manual_mixed_post_1" },
      });
      expect(dbManualPost).not.toBeNull();

      const dbManualCategory = await prisma.category.findUnique({
        where: { id: "manual_mixed_category" },
      });
      expect(dbManualCategory).not.toBeNull();
    });
  });
});