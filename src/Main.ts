import { dirname, importx } from '@discordx/importer';
import { IntentsBitField, Partials } from 'discord.js';
import { Client } from 'discordx';
import 'dotenv/config';
import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import { config, isDev } from './config/Config.js';
import { handleError } from './utils/Util.js';

/**
 * Extends the Discord.js Client to include cluster functionality
 * This allows each shard to communicate with the cluster manager
 */
interface DiscordGPT extends Client {
    cluster: ClusterClient<Client>;
}

/**
 * The Discord.js client instance with conditional sharding support.
 *
 * Development Mode:
 * - Single process, no sharding
 * - Direct client without cluster functionality
 *
 * Production Mode:
 * - Sharding Configuration:
 * - shards: Uses getInfo().SHARD_LIST to get the list of shards this instance should handle
 * - shardCount: Uses getInfo().TOTAL_SHARDS to know the total number of shards
 * - Each instance of the bot (cluster) will handle a subset of the total shards
 */
const clientConfig = {
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages,
    ],
    partials: [Partials.Channel],
    silent: true,
    botGuilds: config.GUILDS,
    ...(isDev
        ? {}
        : {
              shards: getInfo().SHARD_LIST,
              shardCount: getInfo().TOTAL_SHARDS,
          }),
};

export const client = new Client(clientConfig) as DiscordGPT;

/**
 * Handles unhandled rejections by logging the error and sending an embed to a designated logging channel, if enabled.
 * @param error - The error that was not handled.
 * @returns void
 */
process.on('unhandledRejection', async (error) => {
    await handleError(client, error);
});

/**
 * Handles uncaught exception by logging the error and sending an embed to a designated logging channel, if enabled.
 * @param error - The error that was not handled.
 * @returns void
 */
process.on('uncaughtException', async (error) => {
    await handleError(client, error);
});

/**
 * Event handler for client errors
 * @param error - The error that occurred
 * @returns Promise that resolves when error is handled
 */
client.on('error', async (error: unknown) => {
    console.error('Client error:', error);
    await handleError(client, error);
});

/**
 * Runs the bot by loading the required components and logging in the client.
 * @async
 * @returns A Promise that resolves with void when the bot is started.
 * @throws An Error if any required environment variables are missing or invalid.
 */
async function run() {
    /**
     * Delays the execution of the function for a specified time in milliseconds.
     * @param ms - The time in milliseconds to delay the execution of the function.
     * @returns A promise that resolves after the specified time has passed.
     */
    const sleep = (ms: number): Promise<void> =>
        new Promise<void>((resolve) => {
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
            if (!isDev) {
                client.cluster = new ClusterClient(client);
                await sleep(time);
            }
            await client.login(config.BOT_TOKEN);
        } catch (error) {
            console.error('An error occurred while initializing the bot:', error);
        }
    };
    await loadSequentially();
}

await run();
