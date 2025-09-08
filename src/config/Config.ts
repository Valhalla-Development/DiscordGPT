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
    OPENAI_MODEL: z.string().optional().default('gpt-4o'),

    // Required rate limiting
    MAX_QUERIES_LIMIT: z.string().min(1, 'Max queries limit is required').transform(Number),

    // Optional query reset time (minimum 1h, maximum 7d)
    QUERIES_RESET_TIME: z
        .string()
        .optional()
        .default('24h')
        .transform((val) => val || '24h')
        .refine((val) => {
            const timeRegex = /^(\d+)(m|h|d)$/i;
            const match = val.match(timeRegex);
            if (!match) {
                return false;
            }

            const value = Number.parseInt(match[1], 10);
            const unit = match[2].toLowerCase();

            // Convert to minutes for validation
            let minutes = 0;
            if (unit === 'm') {
                minutes = value;
            } else if (unit === 'h') {
                minutes = value * 60;
            } else if (unit === 'd') {
                minutes = value * 24 * 60;
            }

            // Min 1h (60 minutes), Max 7d (10080 minutes)
            return minutes >= 60 && minutes <= 10_080;
        }, 'value must be between 1h and 7d (e.g., "1h", "6h", "24h", "7d")'),

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

        const customErrors = error.issues
            .filter((issue) => issue.code === 'custom')
            .map((issue) => `${issue.path[0]}: ${issue.message}`)
            .join(', ');

        if (missingVars) {
            throw new Error(`Missing required environment variables: ${missingVars}`);
        }

        if (customErrors) {
            throw new Error(`Configuration validation errors: ${customErrors}`);
        }

        throw new Error(`Configuration error: ${error.message}`);
    }
    throw error;
}

export { config };
export const isDev = config.NODE_ENV === 'development';

/**
 * Converts duration string (e.g., "1h", "6h", "24h", "7d") to milliseconds
 * @param duration - Duration string like "1h", "6h", "24h", "7d"
 * @returns Duration in milliseconds
 */
export function durationToMs(duration: string): number {
    const timeRegex = /^(\d+)(m|h|d)$/i;
    const match = duration.match(timeRegex);

    if (!match) {
        throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'm':
            return value * 60 * 1000; // minutes to ms
        case 'h':
            return value * 60 * 60 * 1000; // hours to ms
        case 'd':
            return value * 24 * 60 * 60 * 1000; // days to ms
        default:
            throw new Error(`Invalid duration unit: ${unit}`);
    }
}
