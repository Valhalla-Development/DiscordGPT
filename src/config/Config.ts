import { z } from 'zod';

// Helper transforms for common patterns
const stringToBoolean = (val: string): boolean => val.toLowerCase() === 'true';
const stringToArray = (val: string): string[] => {
    return val
        ? val
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];
};

const configSchema = z.object({
    // Required bot token
    BOT_TOKEN: z.string().min(1, 'Bot token is required'),

    // Required OpenAI configuration
    OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
    OPENAI_ASSISTANT_ID: z.string().min(1, 'OpenAI Assistant ID is required'),

    // Required rate limiting
    MAX_QUERIES_LIMIT: z.string().min(1, 'Max queries limit is required').transform(Number),

    // Required admin/staff configuration
    ADMIN_USER_IDS: z.string().min(1, 'Admin user IDs are required').transform(stringToArray),
    STAFF_ROLE_IDS: z.string().min(1, 'Staff role IDs are required').transform(stringToArray),

    // Required boolean feature toggles
    ENABLE_DIRECT_MESSAGES: z
        .string()
        .regex(/^(true|false)$/, 'Must be "true" or "false"')
        .transform(stringToBoolean),
    ENABLE_EMBED_LINKS: z
        .string()
        .regex(/^(true|false)$/, 'Must be "true" or "false"')
        .transform(stringToBoolean),
    ENABLE_TTS: z
        .string()
        .regex(/^(true|false)$/, 'Must be "true" or "false"')
        .transform(stringToBoolean),
    ENABLE_MESSAGE_THREADS: z
        .string()
        .regex(/^(true|false)$/, 'Must be "true" or "false"')
        .transform(stringToBoolean),

    // Environment (defaults to development)
    NODE_ENV: z.enum(['development', 'production']).default('development'),

    // Optional comma-separated guild IDs (undefined = global, string[] = guild-specific)
    GUILDS: z
        .string()
        .optional()
        .transform((val) => (val ? stringToArray(val) : undefined)),

    // Logging settings
    ENABLE_LOGGING: z.string().optional().default('false').transform(stringToBoolean),
    ERROR_LOGGING_CHANNEL: z.string().optional(),
    COMMAND_LOGGING_CHANNEL: z.string().optional(),

    // Optional server/channel configuration
    ALLOWED_SERVER_IDS: z
        .string()
        .optional()
        .transform((val) => (val ? stringToArray(val) : [])),
    EXCLUDED_CHANNEL_IDS: z
        .string()
        .optional()
        .transform((val) => (val ? stringToArray(val) : [])),
    COMMAND_USAGE_CHANNEL: z.string().optional(),
    SUPPORT_SERVER_INVITE: z.string().optional(),
    REPORT_CHANNEL_ID: z.string().optional(),
});

// Parse config with error handling
let config: z.infer<typeof configSchema>;
try {
    config = configSchema.parse(process.env);

    // Validate logging channels required when logging is enabled
    if (config.ENABLE_LOGGING && !config.ERROR_LOGGING_CHANNEL && !config.COMMAND_LOGGING_CHANNEL) {
        console.warn(
            '⚠️  ENABLE_LOGGING is true but ERROR_LOGGING_CHANNEL and COMMAND_LOGGING_CHANNEL are missing. Logging will be disabled.'
        );
        config.ENABLE_LOGGING = false;
    }
} catch (error) {
    if (error instanceof z.ZodError) {
        const missingVars = error.issues
            .filter((issue) => issue.code === 'too_small' || issue.code === 'invalid_type')
            .map((issue) => issue.path[0])
            .join(', ');

        throw new Error(`Missing required environment variables: ${missingVars}`);
    }
    throw error;
}

export { config };
export const isDev = config.NODE_ENV === 'development';
