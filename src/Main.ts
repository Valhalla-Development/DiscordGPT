import { dirname, importx } from '@discordx/importer';
import {
    ChannelType, codeBlock, EmbedBuilder, IntentsBitField,
} from 'discord.js';
import { Client } from 'discordx';
import 'dotenv/config';

/**
 * The Discord.js client instance.
 */
const client = new Client({
    intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent],
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

    if (process.env.Logging && process.env.Logging.toLowerCase() === 'true') {
        if (!process.env.LoggingChannel) return;

        const channel = client.channels.cache.get(process.env.LoggingChannel);
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
    const missingTokenError = 'The Token environment variable is missing.';
    const invalidLoggingValueError = 'The Logging environment variable must be "true" or "false".';
    const invalidLoggingChannel = 'The LoggingChannel environment variable is required when logging is enabled.';

    if (!process.env.Token) throw new Error(missingTokenError);
    if (process.env.Logging === 'true' && !process.env.LoggingChannel) throw new Error(invalidLoggingChannel);
    if (process.env.Logging !== 'true' && process.env.Logging !== 'false') throw new Error(invalidLoggingValueError);

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
     * Loads the Mongo events, imports the commands and events, and logs in the client.
     * @returns A Promise that resolves with void when everything is loaded sequentially.
     */
    const loadSequentially = async () => {
        try {
            await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
            await sleep(time);
            await client.login(process.env.Token as string);
        } catch (error) {
            console.error('An error occurred while initializing the bot:', error);
        }
    };
    await loadSequentially();
}

await run();
