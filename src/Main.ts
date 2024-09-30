import { dirname, importx } from '@discordx/importer';
import {
    ChannelType, codeBlock, EmbedBuilder, IntentsBitField, Partials,
} from 'discord.js';
import { Client } from 'discordx';
import 'dotenv/config';

/**
 * The Discord.js client instance.
 */
const client = new Client({
    intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages],
    partials: [Partials.Channel],
    silent: true,
});

/**
 * Handles unhandled rejections by logging the error and sending an embed to a designated logging channel, if enabled.
 * @param error - The error that was not handled.
 * @returns void
 */
process.on('unhandledRejection', async (error) => {
    if (!error || !(error instanceof Error) || !error.stack) return;
    console.error(error.stack);

    if (process.env.ENABLE_LOGGING && process.env.ENABLE_LOGGING.toLowerCase() === 'true') {
        if (!process.env.ERROR_LOGGING_CHANNEL) return;

        const channel = client.channels.cache.get(process.env.ERROR_LOGGING_CHANNEL);
        if (!channel || channel.type !== ChannelType.GuildText) return;

        const typeOfError = error.stack.split(':')[0];
        const fullError = error.stack.replace(/^[^:]+:/, '').trimStart();
        const timeOfError = `<t:${Math.floor(new Date().getTime() / 1000)}>`;
        const fullString = `From: \`${typeOfError}\`\nTime: ${timeOfError}\n\nError:\n${codeBlock('js', fullError)}`;

        function truncateDescription(description: string) {
            const maxLength = 2048;
            if (description.length > maxLength) {
                const numTruncatedChars = description.length - maxLength;
                return `${description.slice(0, maxLength)}... ${numTruncatedChars} more`;
            }
            return description;
        }

        const embed = new EmbedBuilder().setTitle('Error').setDescription(truncateDescription(fullString));

        try {
            await channel.send({ embeds: [embed] });
        } catch (sendError) {
            console.error('An error occurred while sending the error embed:', sendError);
        }
    }
});

/**
 * Runs the bot by loading the required components and logging in the client.
 * @async
 * @returns A Promise that resolves with void when the bot is started.
 * @throws An Error if any required environment variables are missing or invalid.
 */
async function run() {
    const missingVar = (v: string) => `The ${v} environment variable is missing.`;
    const invalidBool = (v: string) => `${v} must be "true" or "false".`;

    const required = [
        'BOT_TOKEN', 'OPENAI_API_KEY', 'OPENAI_ASSISTANT_ID', 'MAX_QUERIES_LIMIT',
        'ADMIN_USER_IDS', 'STAFF_ROLE_IDS',
    ];
    const booleans = ['ENABLE_DIRECT_MESSAGES', 'ENABLE_LOGGING', 'ENABLE_EMBED_LINKS', 'ENABLE_TTS'];

    required.forEach((v) => { if (!process.env[v]) throw new Error(missingVar(v)); });
    booleans.forEach((v) => {
        if (process.env[v] !== 'true' && process.env[v] !== 'false') throw new Error(invalidBool(v));
    });

    if (process.env.ENABLE_LOGGING === 'true' && (!process.env.ERROR_LOGGING_CHANNEL && !process.env.COMMAND_LOGGING_CHANNEL)) {
        throw new Error('ERROR_LOGGING_CHANNEL and COMMAND_LOGGING_CHANNEL are required when logging is enabled.');
    }

    /**
     * Delays the execution of the function for a specified time in milliseconds.
     * @param ms - The time in milliseconds to delay the execution of the function.
     * @returns A promise that resolves after the specified time has passed.
     */
    const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
    const time = 200;

    /**
     * Imports the commands and events, and logs in the client.
     * @returns A Promise that resolves with void when everything is loaded sequentially.
     */
    const loadSequentially = async () => {
        try {
            await importx(`${dirname(import.meta.url)}/{events,commands,context}/**/*.{ts,js}`);
            await sleep(time);
            await client.login(process.env.BOT_TOKEN as string);
        } catch (error) {
            console.error('An error occurred while initializing the bot:', error);
        }
    };
    await loadSequentially();
}

await run();
