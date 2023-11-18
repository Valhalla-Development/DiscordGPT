import {
    codeBlock, CommandInteraction, PermissionsBitField, Message,
} from 'discord.js';
import type { Client } from 'discordx';
import type { MessageContentText } from 'openai/resources/beta/threads';
import 'colors';
import OpenAI from 'openai';
import Keyv from 'keyv';

const keyv = new Keyv('sqlite://src/data/db.sqlite', { table: 'userData', namespace: 'userData' });
keyv.on('error', (err) => console.log('[keyv] Connection Error', err));

/**
 * Capitalises the first letter of each word in a string.
 * @param string - The string to be capitalised.
 * @returns The capitalised string.
 */
export function capitalise(string: string): string {
    return string.replace(/\S+/g, (word) => word.slice(0, 1).toUpperCase() + word.slice(1));
}

/**
 * Checks if a message is deletable, and deletes it after a specified amount of time.
 * @param interaction - The message to check.
 * @param delay - The amount of time to wait before deleting the message, in milliseconds.
 * @param client - The Discord Client instance.
 * @returns void
 */
export function messageDelete(interaction: Message | CommandInteraction, delay: number, client: Client): void {
    const user = interaction instanceof Message ? interaction.author : interaction.user;
    const deleteFunction = interaction instanceof Message ? interaction.delete : interaction.deleteReply;

    setTimeout(async () => {
        if (user.id !== client.user?.id
            || !interaction.guild?.members.me?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return;
        }

        try {
            if (interaction) {
                await deleteFunction();
            }
        } catch (error) {
            // Handle the error gracefully, log it, or perform any necessary actions
            console.error('Error deleting message:', error);
        }
    }, delay);
}

/**
 * Fetches the registered global application commands and returns an object
 * containing the command names as keys and their corresponding IDs as values.
 * @param client - The Discord Client instance.
 * @returns An object containing command names and their corresponding IDs.
 * If there are no commands or an error occurs, an empty object is returned.
 */
export async function getCommandIds(client: Client): Promise<{ [name: string]: string }> {
    try {
        // Fetch the registered global application commands
        const commands = await client.application?.commands.fetch();

        if (!commands) {
            return {};
        }

        // Create an object to store the command IDs
        const commandIds: { [name: string]: string } = {};

        commands.forEach((command) => {
            commandIds[command.name] = command.id;
        });

        return commandIds;
    } catch (error) {
        console.error('Error fetching global commands:', error);
        return {};
    }
}

/**
 * Load Assistant function to query the OpenAI API for a response.
 * @param query - The user query to be sent to the Assistant.
 * @param userId - This user id for the specified user.
 * @returns The response text from the Assistant.
 */
export async function loadAssistant(
    query: string,
    userId: string,
): Promise<string | Error> {
    // Retrieve user's GPT query data from the database.
    const userQueryData = await getGptQueryData(userId);

    const str = query.replaceAll(/<@!?(\d+)>/g, '');

    if (str.length <= 4) {
        return 'Please enter a valid query, with a minimum length of 4 characters.';
    }

    try {
        const openai = new OpenAI({
            apiKey: process.env.OpenAiKey,
        });

        // Retrieve the Assistant information
        const assistant = await openai.beta.assistants.retrieve(`${process.env.AssistantId}`);

        // Fetch or create thread.
        let thread: OpenAI.Beta.Threads.Thread;
        try {
            thread = userQueryData && userQueryData.threadId
                ? await openai.beta.threads.retrieve(userQueryData.threadId)
                : await openai.beta.threads.create();
        } catch {
            thread = await openai.beta.threads.create();
        }

        const {
            totalQueries, queriesRemaining,
            expiration, whitelisted, blacklisted,
        } = userQueryData || {};

        await setGptQueryData(
            userId,
            Number(totalQueries) || 0,
            Number(queriesRemaining) || 0,
            Number(expiration) || 0,
            whitelisted || false,
            blacklisted || false,
            thread.id,
        );

        // Add a user message to the thread
        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: str,
        });

        // Create a run with the Assistant
        const createRun = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistant.id,
        });

        let retrieve = await openai.beta.threads.runs.retrieve(thread.id, createRun.id);

        // Define a sleep function
        const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });

        console.log(`Queued query: ${str}`);

        /**
         * Check the completion status of the query run.
         */
        async function checkCompletion() {
            if (retrieve.status !== 'completed' && retrieve.status !== 'in_progress' && retrieve.status !== 'queued') {
                throw new Error(`[Check Completion] Unexpected status: ${retrieve.status}`);
            }

            console.log(`Status: ${retrieve.status}`);
            if (retrieve.status !== 'completed') {
                await sleep(2000);
                retrieve = await openai.beta.threads.runs.retrieve(thread.id, createRun.id);
                await checkCompletion();
            }
        }

        await checkCompletion();

        // Get the list of messages in the thread
        const messages = await openai.beta.threads.messages.list(thread.id);

        console.log('Completed query.');

        // Extract text value from the Assistant's response
        const textValue = (messages.data[0].content[0] as MessageContentText)?.text?.value;
        return textValue.replaceAll(/【.*?】/g, '');
    } catch (error) {
        console.error(error);
        return error as Error;
    }
}

/**
 * Sets GPT query data for a specific user.
 * @param userId - The ID of the user.
 * @param totalQueries - Total queries made
 * @param queriesRemaining - The remaining queries for the user.
 * @param expiration - The expiration timestamp for the data.
 * @param whitelisted - The whitelist status for the user.
 * @param blacklisted - The blacklist status for the user.
 * @param threadId - The thread id for the given user.
 * @returns A promise that resolves with the newly set data.
 */
export async function setGptQueryData(
    userId: string,
    totalQueries: number,
    queriesRemaining: number,
    expiration: number,
    whitelisted: boolean,
    blacklisted: boolean,
    threadId: string,
): Promise<{ totalQueries: number; queriesRemaining: number; expiration: number; whitelisted: boolean; blacklisted: boolean; threadId: string }> {
    // Convert booleans to integers for SQLite storage
    const whitelistedInt = whitelisted ? 1 : 0;
    const blacklistedInt = blacklisted ? 1 : 0;

    await keyv.set(userId, {
        totalQueries, queriesRemaining, expiration, whitelisted: whitelistedInt, blacklisted: blacklistedInt, threadId,
    });
    return {
        totalQueries, queriesRemaining, expiration, whitelisted, blacklisted, threadId,
    };
}

/**
 * Retrieves GPT query data for a specific user.
 * @param userId - The ID of the user.
 * @returns A promise that resolves with the retrieved data or `false` if no data is found.
 */
export async function getGptQueryData(
    userId: string,
): Promise<{ totalQueries: number,
    queriesRemaining: number; expiration: number; whitelisted: boolean; blacklisted: boolean; threadId: string } | false> {
    const data = await keyv.get(userId);

    // If data exists, convert integer values to booleans and return
    if (data) {
        const {
            totalQueries, queriesRemaining, expiration, whitelisted, blacklisted, threadId,
        } = data;
        return {
            totalQueries,
            queriesRemaining,
            expiration,
            whitelisted: Boolean(whitelisted), // Convert 0 or 1 to boolean
            blacklisted: Boolean(blacklisted), // Convert 0 or 1 to boolean
            threadId,
        };
    }

    // If no data is found, return false
    return false;
}

/**
 * Checks GPT availability for a specific user and manages query limits.
 * @param userId - The ID of the user.
 * @returns A string indicating the reset time or a boolean for query availability.
 */
export async function checkGptAvailability(userId: string): Promise<string | boolean> {
    // Variable for rate limit.
    const { RateLimit } = process.env;

    // Retrieve user's GPT query data from the database.
    const userQueryData = await getGptQueryData(userId);

    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + (24 * 60 * 60 * 1000));

    // User's query data exists.
    if (userQueryData) {
        // If the user is blacklisted
        if (userQueryData.blacklisted) return 'You are currently blacklisted. If you believe this is a mistake, please contact a moderator.';

        // If the user is whitelisted
        if (userQueryData.whitelisted) {
            await setGptQueryData(
                userId,
                Number(userQueryData.totalQueries) + Number(1),
                Number(RateLimit),
                Number(1),
                userQueryData.whitelisted,
                userQueryData.blacklisted,
                userQueryData.threadId,
            );
            return true;
        }

        // User has exhausted their query limit.
        if (userQueryData.queriesRemaining <= 0) {
            const expiration = new Date(userQueryData.expiration);

            // 24 hours have passed since the initial entry. Resetting data.
            if (currentTime > expiration) {
                await setGptQueryData(
                    userId,
                    Number(userQueryData.totalQueries) + Number(1),
                    Number(RateLimit),
                    Number(expirationTime),
                    userQueryData.whitelisted,
                    userQueryData.blacklisted,
                    userQueryData.threadId,
                );
                return true;
            }

            // Queries expired, 24 hours not passed.
            // Convert the expiration time to epoch time
            const epochTime = Math.floor(Number(expiration) / 1000);

            // Return a string indicating the reset time of available queries
            return `Looks like you've reached your query limit for now. Don't worry, your queries will reset in <t:${epochTime}:R>`;
        }

        // User has queries remaining, remove 1 query from the database.
        await setGptQueryData(
            userId,
            Number(userQueryData.totalQueries) + Number(1),
            Number(userQueryData.queriesRemaining) - Number(1),
            Number(userQueryData.expiration),
            userQueryData.whitelisted,
            userQueryData.blacklisted,
            userQueryData.threadId,
        );
        return true;
    }

    // User has no existing data. Creating a new entry.
    await setGptQueryData(
        userId,
        Number(1),
        Number(RateLimit) - Number(1),
        Number(expirationTime),
        false,
        false,
        '',
    );
    return true;
}

/**
 * Runs the GPT assistant for the specified user and content.
 * @param content - The content for the GPT assistant.
 * @param userId - This user id for the specified user.
 * @returns A promise that resolves to an object with content and success properties.
 * - `content`: The response content from the GPT assistant.
 * - `success`: A boolean indicating whether the operation was successful.
 * @throws An error if there is an issue with the GPT assistant or user queries.
 */
export async function runGPT(
    content: string,
    userId: string,
): Promise<string> {
    // Check if the user has available queries.
    const isGptAvailable = await checkGptAvailability(userId);

    if (typeof isGptAvailable === 'string') return isGptAvailable;

    // Load the Assistant for the message content
    const response = await loadAssistant(content, userId);

    // Reply with the Assistant's response
    if (typeof response === 'string') return response;

    // Response was not a string, therefore, is an error
    return `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${response}`)}`;
}
