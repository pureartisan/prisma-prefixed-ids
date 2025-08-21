import { beforeAll, afterAll, beforeEach, describe, it, expect, jest } from '@jest/globals';
import { PrismaClient } from './client';
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
    prisma = new PrismaClient();
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