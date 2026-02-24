import { beforeAll, afterAll, beforeEach, describe, it, expect, jest } from '@jest/globals';
import { config } from 'dotenv';
import { PrismaClient } from './client-postgres';
import { PrismaPg } from '@prisma/adapter-pg';
import { extendPrismaClient } from '../src/index';

// Load environment variables from .env file
config();

// Mock nanoid to avoid ESM issues and ensure unique IDs
let globalCounter = 1;
jest.mock('nanoid', () => ({
  customAlphabet: jest.fn().mockImplementation(() => {
    return () => `test_id_${globalCounter++}_${Date.now()}`;
  }),
}));

// Integration tests with real PostgreSQL database
describe('PostgreSQL Integration Tests - Nested Create with Arrays', () => {
  let prisma: PrismaClient;
  let extendedPrisma: ReturnType<typeof extendPrismaClient<any>>;
  const testRunId = Date.now().toString();

  beforeAll(async () => {
    // Skip tests if DATABASE_URL is not set
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set, skipping PostgreSQL tests');
      return;
    }

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter } as any);
    await prisma.$connect();

    // Extend Prisma client with prefixed IDs after connection
    extendedPrisma = extendPrismaClient(prisma, {
      prefixes: {
        Order: "ord",
        LineItem: "lin",
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    if (!prisma) return;
    
    // Clean up database before each test
    await prisma.lineItem.deleteMany();
    await prisma.order.deleteMany();
  });

  describe('Nested Create with Arrays (createMany in disguise)', () => {
    it('should create order with nested lineItems using create array', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      const order = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-${testRunId}`,
          lineItems: {
            create: [
              {
                quantity: 2,
                price: 10.50,
              },
              {
                quantity: 3,
                price: 20.75,
              },
            ],
          },
        },
        include: {
          lineItems: true,
        },
      });

      expect(order.id).toMatch(/^ord_/);
      expect(order.lineItems).toHaveLength(2);
      
      // Verify each line item has a unique prefixed ID
      const lineItemIds = order.lineItems.map((item: any) => item.id);
      expect(new Set(lineItemIds).size).toBe(2); // All IDs should be unique
      
      order.lineItems.forEach((item: any) => {
        expect(item.id).toMatch(/^lin_/);
        expect(item.orderId).toBe(order.id);
      });

      // Verify line items exist in database with unique IDs
      const lineItemsInDb = await prisma.lineItem.findMany({
        where: { orderId: order.id },
      });
      expect(lineItemsInDb).toHaveLength(2);
      
      const dbLineItemIds = lineItemsInDb.map((item: any) => item.id);
      expect(new Set(dbLineItemIds).size).toBe(2); // All IDs should be unique
      
      lineItemsInDb.forEach((item: any) => {
        expect(item.id).toMatch(/^lin_/);
      });
    });

    it('should create order with multiple nested lineItems without manual IDs', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      // This is the exact scenario reported by the user
      const order = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-MULTI-${testRunId}`,
          lineItems: {
            create: [
              {
                quantity: 1,
                price: 5.00,
              },
              {
                quantity: 2,
                price: 15.00,
              },
              {
                quantity: 3,
                price: 25.00,
              },
            ],
          },
        },
        include: {
          lineItems: true,
        },
      });

      expect(order.id).toMatch(/^ord_/);
      expect(order.lineItems).toHaveLength(3);
      
      // Critical test: Verify all IDs are unique
      const lineItemIds = order.lineItems.map((item: any) => item.id);
      const uniqueIds = new Set(lineItemIds);
      expect(uniqueIds.size).toBe(3); // Must have 3 unique IDs
      
      // Verify in database
      const lineItemsInDb = await prisma.lineItem.findMany({
        where: { orderId: order.id },
      });
      expect(lineItemsInDb).toHaveLength(3);
      
      const dbLineItemIds = lineItemsInDb.map((item: any) => item.id);
      const dbUniqueIds = new Set(dbLineItemIds);
      expect(dbUniqueIds.size).toBe(3); // Must have 3 unique IDs in database
    });

    it('should handle mixed manual and auto-generated IDs in nested create array', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      const order = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-MIXED-${testRunId}`,
          lineItems: {
            create: [
              {
                id: 'manual_line_item_1',
                quantity: 1,
                price: 10.00,
              },
              {
                quantity: 2,
                price: 20.00,
              },
              {
                id: 'manual_line_item_3',
                quantity: 3,
                price: 30.00,
              },
            ],
          },
        },
        include: {
          lineItems: true,
        },
      });

      expect(order.id).toMatch(/^ord_/);
      expect(order.lineItems).toHaveLength(3);
      
      // Verify manual IDs were preserved
      const manualItem1 = order.lineItems.find((item: any) => item.id === 'manual_line_item_1');
      const manualItem3 = order.lineItems.find((item: any) => item.id === 'manual_line_item_3');
      const autoItem = order.lineItems.find(
        (item: any) => item.id !== 'manual_line_item_1' && item.id !== 'manual_line_item_3'
      );
      
      expect(manualItem1).toBeDefined();
      expect(manualItem3).toBeDefined();
      expect(autoItem).toBeDefined();
      expect(autoItem!.id).toMatch(/^lin_/);
      
      // Verify all IDs are unique
      const lineItemIds = order.lineItems.map((item: any) => item.id);
      expect(new Set(lineItemIds).size).toBe(3);
    });
  });

  describe('Upsert Operations', () => {
    it('should handle upsert with nested creates inside update branch', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      // First create an order
      const order = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-UPSERT-UPDATE-${testRunId}`,
          lineItems: {
            create: {
              quantity: 1,
              price: 10.00,
            },
          },
        },
        include: { lineItems: true },
      });

      const existingLineItemId = order.lineItems[0].id;

      // Upsert the order - it exists, so the update branch runs
      // The update branch creates a new line item
      const upsertedOrder = await extendedPrisma.order.upsert({
        where: { orderNumber: `ORDER-UPSERT-UPDATE-${testRunId}` },
        create: {
          orderNumber: `ORDER-UPSERT-UPDATE-${testRunId}`,
        },
        update: {
          lineItems: {
            create: {
              quantity: 5,
              price: 50.00,
            },
          },
        },
        include: { lineItems: true },
      });

      expect(upsertedOrder.id).toBe(order.id);
      expect(upsertedOrder.lineItems).toHaveLength(2);

      const newLineItem = upsertedOrder.lineItems.find((item: any) => item.id !== existingLineItemId);
      expect(newLineItem).toBeDefined();
      expect(newLineItem!.id).toMatch(/^lin_/);
      expect(newLineItem!.quantity).toBe(5);
    });

    it('should handle array upsert on nested relations', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      // Create an order with one line item
      const order = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-ARRAY-UPSERT-${testRunId}`,
          lineItems: {
            create: {
              quantity: 1,
              price: 10.00,
            },
          },
        },
        include: { lineItems: true },
      });

      const existingLineItemId = order.lineItems[0].id;

      // Update with array upsert on line items
      const updatedOrder = await extendedPrisma.order.update({
        where: { id: order.id },
        data: {
          lineItems: {
            upsert: [
              {
                where: { id: existingLineItemId },
                create: { quantity: 99, price: 99.00 },
                update: { quantity: 10 },
              },
              {
                where: { id: 'lin_nonexistent' },
                create: { quantity: 3, price: 30.00 },
                update: { quantity: 99 },
              },
            ],
          },
        },
        include: { lineItems: true },
      });

      expect(updatedOrder.lineItems).toHaveLength(2);

      const updated = updatedOrder.lineItems.find((item: any) => item.id === existingLineItemId);
      expect(updated).toBeDefined();
      expect(updated!.quantity).toBe(10);

      const created = updatedOrder.lineItems.find((item: any) => item.id !== existingLineItemId);
      expect(created).toBeDefined();
      expect(created!.id).toMatch(/^lin_/);
      expect(created!.quantity).toBe(3);
    });
  });

  describe('ConnectOrCreate Operations', () => {
    it('should handle single-object connectOrCreate on nested relations', async () => {
      if (!prisma) {
        console.warn('Skipping test - DATABASE_URL not set');
        return;
      }

      // Create a line item first
      const order1 = await extendedPrisma.order.create({
        data: {
          orderNumber: `ORDER-COC-SETUP-${testRunId}`,
          lineItems: {
            create: {
              quantity: 1,
              price: 10.00,
            },
          },
        },
        include: { lineItems: true },
      });

      const existingLineItemId = order1.lineItems[0].id;

      // Update another order using connectOrCreate as a single object
      const order2 = await extendedPrisma.order.update({
        where: { id: order1.id },
        data: {
          lineItems: {
            connectOrCreate: {
              where: { id: 'lin_nonexistent' },
              create: { quantity: 7, price: 70.00 },
            },
          },
        },
        include: { lineItems: true },
      });

      expect(order2.lineItems).toHaveLength(2);

      const newItem = order2.lineItems.find((item: any) => item.id !== existingLineItemId);
      expect(newItem).toBeDefined();
      expect(newItem!.id).toMatch(/^lin_/);
      expect(newItem!.quantity).toBe(7);
    });
  });
});
