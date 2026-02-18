# Code Review Checklist with Examples (tdd-code-reviewer)

This file is available as a reference for `tdd-code-reviewer` when reviewing specific patterns. Load it if you need detailed examples for any checklist item.

## 1. TypeScript Quality

### No `any` types

```typescript
// ❌ BAD
function process(data: any): any {
  return data.value;
}

// ✅ GOOD
interface ProcessInput {
  value: string;
}
function process(data: ProcessInput): string {
  return data.value;
}
```

### Strict null checks

```typescript
// ❌ BAD
function getUser(id: string) {
  const user = users.find(u => u.id === id);
  return user!.name; // Non-null assertion without justification
}

// ✅ GOOD
function getUser(id: string): string | null {
  const user = users.find(u => u.id === id);
  return user?.name ?? null;
}
```

### Proper async/Promise typing

```typescript
// ❌ BAD
async function fetchData(): Promise<any> {
  return fetch('/api/data');
}

// ✅ GOOD
interface ApiResponse {
  items: Item[];
  total: number;
}
async function fetchData(): Promise<ApiResponse> {
  const res = await fetch('/api/data');
  return res.json() as ApiResponse;
}
```

## 2. Error Handling

### Custom Error classes

```typescript
// ❌ BAD
throw new Error('User not found');

// ✅ GOOD
class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}
throw new UserNotFoundError(userId);
```

### No silent catch blocks

```typescript
// ❌ BAD
try {
  await riskyOperation();
} catch (e) {
  console.log(e); // Silent, loses context
}

// ✅ GOOD
try {
  await riskyOperation();
} catch (error) {
  throw new OperationError('Risky operation failed', { cause: error });
}
```

### Error context preservation

```typescript
// ❌ BAD
try {
  await db.save(entity);
} catch {
  throw new Error('Save failed');
}

// ✅ GOOD
try {
  await db.save(entity);
} catch (error) {
  throw new DatabaseError('Failed to save entity', {
    cause: error,
    context: { entityId: entity.id, collection: 'users' },
  });
}
```

## 3. Security Issues

### Input validation

```typescript
// ❌ BAD
async function getUser(req: Request) {
  const id = req.params.id;
  return db.find({ _id: id }); // No validation
}

// ✅ GOOD
async function getUser(req: Request) {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || !/^[a-z0-9]{24}$/.test(id)) {
    throw new ValidationError('Invalid user ID format');
  }
  return db.find({ _id: id });
}
```

### No hardcoded secrets

```typescript
// ❌ BAD
const apiKey = 'sk-1234567890abcdef';

// ✅ GOOD
const apiKey = process.env.API_KEY;
if (!apiKey) throw new ConfigError('API_KEY environment variable not set');
```

## 4. Clean Code

### Single Responsibility Principle

```typescript
// ❌ BAD — one function does too much
async function processOrder(order: Order) {
  // Validate
  if (!order.userId) throw new Error('Missing user');
  // Fetch user
  const user = await db.users.findById(order.userId);
  // Apply discount
  const discount = user.isPremium ? 0.1 : 0;
  // Save order
  await db.orders.save({ ...order, discount });
  // Send email
  await emailService.send(user.email, 'Order confirmed');
}

// ✅ GOOD — each function has one purpose
async function processOrder(order: Order) {
  validateOrder(order);
  const user = await userService.getById(order.userId);
  const pricedOrder = applyDiscount(order, user);
  await orderRepository.save(pricedOrder);
  await notificationService.sendOrderConfirmation(user.email);
}
```

### Guard clauses (early returns)

```typescript
// ❌ BAD
function processPayment(amount: number, user: User) {
  if (amount > 0) {
    if (user.isActive) {
      if (user.hasValidCard) {
        // actual logic
      }
    }
  }
}

// ✅ GOOD
function processPayment(amount: number, user: User) {
  if (amount <= 0) throw new ValidationError('Amount must be positive');
  if (!user.isActive) throw new UserError('User account is inactive');
  if (!user.hasValidCard) throw new PaymentError('No valid payment method');
  // actual logic
}
```

## 5. FixRequest Severity Guide

| Severity | Examples |
|----------|----------|
| critical | `any` type on security-sensitive data, missing try/catch on network calls, hardcoded secrets, SQL injection vector |
| major | Missing error handling on DB operations, SRP violation causing coupling, undefined behavior on edge cases |
| minor | Variable naming, async/await vs .then(), comment improvements, destructuring |

## FixRequest routeTo Decision

| Issue Type | routeTo |
|------------|---------|
| `any` type, missing interface | implementer |
| Missing try/catch, custom error | implementer |
| Security validation missing | implementer |
| Code duplication, extract util | refactorer |
| SRP violation, split function | refactorer |
| Naming improvement | refactorer |
| Move file to correct directory | implementer |
