"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
const strongPassword = zod_1.z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character');
const safeUsername = zod_1.z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must not exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .transform(val => val.toLowerCase());
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        username: safeUsername,
        password: strongPassword,
    }),
});
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        username: zod_1.z.string().min(1, 'Username is required'),
        password: zod_1.z.string().min(1, 'Password is required'),
    }),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validate = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            return next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Validation failed',
                    errors: error.issues.map((issue) => ({
                        path: issue.path,
                        message: issue.message,
                    })),
                });
            }
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    };
};
exports.validate = validate;
