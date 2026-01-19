const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSchema, voteSchema } = require('./validation');

test('registerSchema accepts valid input', () => {
  const out = registerSchema.parse({ name: 'Jane', email: 'Jane@Email.com' });
  assert.equal(out.name, 'Jane');
  assert.equal(out.email, 'jane@email.com');
});

test('registerSchema rejects invalid email', () => {
  const res = registerSchema.safeParse({ name: 'Jane', email: 'not-an-email' });
  assert.equal(res.success, false);
});

test('voteSchema accepts valid input', () => {
  const res = voteSchema.safeParse({
    userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    showdownId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    choice: 'RED',
  });
  assert.equal(res.success, true);
});

test('voteSchema rejects bad choice', () => {
  const res = voteSchema.safeParse({
    userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    showdownId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    choice: 'GREEN',
  });
  assert.equal(res.success, false);
});
