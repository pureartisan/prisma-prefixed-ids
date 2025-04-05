# Prisma Prefixed IDs

A Prisma extension that automatically adds prefixed IDs to your models. This package allows you to configure custom prefixes for your models and even customize how the IDs are generated.

## Installation

```bash
npm install prisma-prefixed-ids
```

## Usage

```typescript
import { type Prisma, PrismaClient } from "@prisma/client";
import { extendPrismaClient } from 'prisma-prefixed-ids';

type ModelName = Prisma.ModelName;
// NOTE: is your Prisma.ModelName is not available in your setup,
// simply use the following instead:
// type ModelName = string;

// Create your Prisma client
const prisma = new PrismaClient();

// Define your model prefixes
const prefixes: Partial<Record<ModelName, string>> = {
	 Organization: 'org',
  User: 'usr',
  // Add more model prefixes as needed
};

// Extend the client with prefixed IDs
const extendedPrisma = extendPrismaClient(prisma, {
  prefixes,
});

// Use the extended client
const organization = await extendedPrisma.organization.create({
  data: {
    name: 'My Organization',
    // id will be automatically generated with prefix 'org_'
  },
});

console.log(organization.id); // e.g., 'org_abc123...'
```

## Custom ID Generation

You can customize how IDs are generated by providing your own ID generator function:

```typescript
import { extendPrismaClient } from 'prisma-prefixed-ids';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const customIdGenerator = (prefix: string) => {
  const nanoid = customAlphabet('1234567890abcdef', 10);
  return `${prefix}_${nanoid()}`;
};

const extendedPrisma = extendPrismaClient(prisma, {
  prefixes: {
    Organization: 'org',
    User: 'usr',
  },
  idGenerator: customIdGenerator,
});
```

## Configuration Options

The extension accepts the following configuration:

- `prefixes`: A record mapping model names to their prefixes (required)
- `idGenerator`: A function that generates IDs (optional, defaults to using nanoid)

### Prefixes Configuration

The `prefixes` configuration is a simple object where:
- Keys are your Prisma model names (case sensitive)
- Values are the prefixes you want to use (without the underscore, which is added automatically)

Example:
```typescript
const prefixes = {
  Organization: 'org',
  User: 'usr',
  Post: 'post',
  Comment: 'cmt',
};
```

### ID Generator Function

The `idGenerator` function should:
- Accept a prefix as its only parameter
- Return a string that will be used as the ID

The default generator uses nanoid with a 24-character length and alphanumeric characters.

## License

MIT 