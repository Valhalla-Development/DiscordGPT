import {
    AttachmentBuilder, codeBlock, Message, User,
} from 'discord.js';
import type { Client } from 'discordx';
import type { TextContentBlock } from 'openai/resources/beta/threads';
import '@colors/colors';
import OpenAI from 'openai';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import moment from 'moment';

interface UserData {
    totalQueries: number;
    queriesRemaining: number;
    expiration: number;
    whitelisted: number;
    blacklisted: number;
    threadId: string;
}

interface EntryValue {
    userId?: string;
    totalQueries: number;
}

const keyv = new Keyv({ store: new KeyvSqlite({ uri: 'sqlite://src/data/db.sqlite' }), namespace: 'userData' });
keyv.on('error', (err) => console.log('[keyv] Connection Error', err));

/**
 * Capitalises the first letter of each word in a string.
 * @param string - The string to be capitalised.
 * @returns The capitalised string.
 */
export function capitalise(string: string): string {
    return string.split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Checks if a message is deletable, and deletes it after a specified amount of time.
 * @param message - The message to check.
 * @param delay - The amount of time to wait before deleting the message, in milliseconds.
 * @returns void
 */
export function messageDelete(message: Message, delay: number): void {
    setTimeout(async () => {
        try {
            if (message && message.deletable) {
                await message.delete();
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
        return Object.fromEntries(
            commands.map((command) => [command.name, command.id]),
        );
    } catch (error) {
        console.error('Error fetching global commands:', error);
        return {};
    }
}

/**
 * Load Assistant function to query the OpenAI API for a response.
 * @param query - The user query to be sent to the Assistant.
 * @param image - Optional image to include in the query
 * @param user - The User for the target.
 * @returns The response text from the Assistant.
 */
export async function loadAssistant(
    query: string,
    image: string | null,
    user: User,
): Promise<string | string[] | Error | boolean> {
    // Retrieve user's GPT query data from the database.
    const userQueryData = await getGptQueryData(user.id);

    const str = query.replaceAll(/<@!?(\d+)>/g, '');

    if (str.length < 4) {
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
            expiration, whitelisted, blacklisted, threadId,
        } = userQueryData || {};

        if (threadId !== thread.id) {
            await setGptQueryData(
                user.id,
                Number(totalQueries) || 0,
                Number(queriesRemaining) || 0,
                Number(expiration) || 0,
                whitelisted || false,
                blacklisted || false,
                thread.id,
            );
        }

        // This section check if the user has an existing run.
        let existingRun;

        try {
            const response = await openai.beta.threads.runs.list(thread.id);
            existingRun = ['queued', 'in_progress'].includes(response?.data?.[0]?.status) || false;
        } catch {
            existingRun = false;
        }

        if (existingRun) return true;

        // Add a user message to the thread
        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: str,
        });

        if (image) {
            await openai.beta.threads.messages.create(thread.id, {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: image },
                    },
                ],
            });
        }

        // Create a run with the Assistant
        const createRun = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistant.id,
        });

        let retrieve = await openai.beta.threads.runs.retrieve(thread.id, createRun.id);

        // Define a sleep function
        const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });

        console.log(
            `${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
            + `${'🚀 Query initiated by '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}\n`
            + `${'📝 Query: '.brightBlue.bold}${str.brightYellow.bold}`,
        );

        /**
         * Check the completion status of the query run.
         */
        async function checkCompletion() {
            if (retrieve.status !== 'completed' && retrieve.status !== 'in_progress' && retrieve.status !== 'queued') {
                // Optional last error message if it exists
                const lastError = retrieve.last_error ? `\nError Code: ${retrieve.last_error.code}` : '';

                // Throw an error message
                throw new Error(`completion\nStatus: ${retrieve.status}${lastError}`);
            }

            console.log(retrieve.status === 'completed'
                ? `${'✅ Status: '.brightBlue.bold}${retrieve.status.brightGreen.bold}`
                : `${'🔄 Status: '.brightBlue.bold}${retrieve.status.brightYellow.bold}`);

            if (retrieve.status !== 'completed') {
                await sleep(2000);
                retrieve = await openai.beta.threads.runs.retrieve(thread.id, createRun.id);
                await checkCompletion();
            }
        }

        await checkCompletion();

        // Get the list of messages in the thread
        const messages = await openai.beta.threads.messages.list(thread.id);

        console.log(`${'🎉 Completed query for '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}\n`);

        // Extract text value from the Assistant's response
        const textValue = (messages.data[0].content[0] as TextContentBlock)?.text?.value;

        // Process string
        const responseText = await processString(textValue);

        // If the length of the text is greater than the desired target and does not exceed a desired target
        // then proceed to split the response into an array of messages
        if (responseText.length >= 1950) {
            return await splitMessages(responseText, 1950);
        }

        // Length does not exceed the desired target, return string
        return responseText;
    } catch (error) {
        console.error(error);
        return error as Error;
    }
}
/**
 * Runs the Text-to-Speech (TTS) process.
 * Converts the provided text (`str`) into speech audio using OpenAI's TTS model.
 * Returns either an `AttachmentBuilder` containing the audio file, a string indicating an error with availability,
 * or an `Error` if the TTS generation fails.
 * @param str - The text to convert to speech.
 * @param user - The user initiating the request, used to check available TTS queries.
 * @returns A promise that resolves to an `AttachmentBuilder`, a string (for errors or messages), or an `Error`.
 */
export async function runTTS(
    str: string,
    user: User,
): Promise<AttachmentBuilder | string | Error> {
    // Check if the user has available queries.
    const isGptAvailable = await checkGptAvailability(user.id);

    // If the user has no available queries, return the error message.
    if (typeof isGptAvailable === 'string') return isGptAvailable;

    try {
        console.log(
            `${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
            + `${'🚀 Text-to-Speech initiated by '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}`,
        );

        // Initialize the OpenAI instance using the provided API key from the environment variables.
        const openai = new OpenAI({ apiKey: process.env.OpenAiKey });

        // Request the TTS generation using OpenAI's speech model with the 'nova' voice.
        const tts = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'nova',
            input: str,
        });

        console.log(`${'🎉 Completed text-to-speech for '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}\n`);

        // Return the generated speech as an audio attachment (mp3 format).
        return new AttachmentBuilder(Buffer.from(await tts.arrayBuffer()), { name: 'tts.mp3' });
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
    // Helper function to convert boolean to integer
    const boolToInt = (bool: boolean) => (bool ? 1 : 0);

    // Store the data
    await keyv.set(userId, {
        totalQueries,
        queriesRemaining,
        expiration,
        whitelisted: boolToInt(whitelisted),
        blacklisted: boolToInt(blacklisted),
        threadId,
    });

    // Return the data
    return {
        totalQueries,
        queriesRemaining,
        expiration,
        whitelisted,
        blacklisted,
        threadId,
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
    const data = await keyv.get(userId) as UserData | null;

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
            return `It looks like you've reached your query limit for now. Don't worry, your queries will reset in <t:${epochTime}:R>`;
        }

        // User has queries remaining, remove 1 query from the database.
        await setGptQueryData(
            userId,
            Number(userQueryData.totalQueries) + Number(1),
            Number(userQueryData.queriesRemaining) - Number(1),
            Number(userQueryData.expiration) === 1 ? Number(expirationTime) : Number(userQueryData.expiration),
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
 * @param image - Optional image to include in the query
 * @param user - The User object for target.
 * @returns A promise that resolves to an object with content and success properties.
 * - `content`: The response content from the GPT assistant.
 * - `success`: A boolean indicating whether the operation was successful.
 * @throws An error if there is an issue with the GPT assistant or user queries.
 */
export async function runGPT(
    content: string,
    image: string | null,
    user: User,
): Promise<string[] | string | boolean> {
    // Check if the user has available queries.
    const isGptAvailable = await checkGptAvailability(user.id);

    if (typeof isGptAvailable === 'string') return isGptAvailable;

    // Load the Assistant for the message content
    const response = await loadAssistant(content.trim(), image || null, user);

    // If the typeof response is boolean and true, the user already has an ongoing prompt.
    if (typeof response === 'boolean') return true;

    // Reply with the Assistant's response
    if (typeof response === 'string' || Array.isArray(response)) return response;

    // Response was not a string, therefore, is an error
    return `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${response}`)}`;
}

/**
 * Splits a given content string into chunks of a specified size, ensuring words are not cut.
 * Each chunk is appended with a page number and the total number of chunks.
 * @param content - The input string to be split.
 * @param length - The desired length of each chunk.
 * @returns A promise resolving to an array of strings representing the split content.
 */
export async function splitMessages(content: string, length: number): Promise<string[]> {
    const chunks: string[] = [];
    let remainingContent = content.trim();

    while (remainingContent.length > 0) {
        let chunkEnd = length;

        // If the remaining content is shorter than maxLength, use its length
        if (remainingContent.length <= length) {
            chunkEnd = remainingContent.length;
        } else {
            // Find the last space within the length limit
            while (chunkEnd > 0 && remainingContent[chunkEnd - 1] !== ' ') {
                chunkEnd -= 1;
            }

            // If no space found, find the next space after length
            if (chunkEnd === 0) {
                chunkEnd = remainingContent.indexOf(' ', length);
                if (chunkEnd === -1) chunkEnd = remainingContent.length; // If no space found, take the whole remaining content
            }
        }

        // Extract the chunk
        const chunk = remainingContent.slice(0, chunkEnd).trim();
        chunks.push(chunk);

        // Update remaining content
        remainingContent = remainingContent.slice(chunkEnd).trim();
    }

    // Add page numbers to chunks
    const totalChunks = chunks.length;
    return chunks.map((chunk, index) => `${chunk}\n\`${index + 1}\`/\`${totalChunks}\``);
}

/**
 * Processes a string by removing specific brackets and formatting links based on environment variables.
 * @param str - The input string to process.
 * @returns A promise that resolves to the processed string.
 */
export async function processString(str: string): Promise<string> {
    /**
     * Removes all occurrences of text enclosed in 【】 from the input string.
     * @param s - The input string to process.
     * @returns The string with all occurrences of 【...】 removed.
     */
    const removeBrackets = (s: string) => s.replace(/【.*?】/g, '');

    /**
     * Processes links in the input string based on the EmbedLinks environment variable.
     * @param s - The input string to process.
     * @returns The string with links formatted according to the EmbedLinks environment variable.
     */
    const processLinks = (s: string) => s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
        if (process.env.EmbedLinks === 'false') {
            return text === url ? `<${url}>` : `[${text}](<${url}>)`;
        }
        return text === url ? url : `[${text}](${url})`;
    });

    // Remove brackets and then process links.
    return processLinks(removeBrackets(str));
}

/**
 * Iterates through entries from a key-value store, calculates the total queries sum,
 * and returns the top 10 entries sorted by the number of queries in descending order.
 *
 * @returns A Promise that resolves to an object containing the total queries sum and
 *          an array of the top 10 entries, or an Error if something goes wrong.
 */
export async function fetchAllData(): Promise<{ totalQueriesSum: number; top10Entries: EntryValue[] } | Error> {
    try {
        const entries: EntryValue[] = [];
        let totalQueriesSum = 0;

        // Iterate through the key-value store
        // @ts-expect-error temp
        for await (const [key, value] of keyv.iterator()) {
            const entry = { totalQueries: value.totalQueries, userId: key };
            entries.push(entry);
            totalQueriesSum += entry.totalQueries;
        }

        // Return the results: total queries sum and top 10 sorted entries
        return {
            totalQueriesSum,
            top10Entries: entries
                .sort((a, b) => b.totalQueries - a.totalQueries)
                .slice(0, 10),
        };
    } catch (error) {
        return error as Error;
    }
}

/**
 * Applies a reversed rainbow effect to the input string.
 * Each character in the string is colored in a sequence of colors in the reversed rainbow order.
 *
 * @param str - The string to which the reversed rainbow effect will be applied.
 * @returns The input string with each character colored according to the reversed rainbow sequence.
 */
export function reversedRainbow(str: string): string {
    // Define color functions that apply the color to the text
    const colorFunctions = {
        red: (text: string) => text.red,
        magenta: (text: string) => text.magenta,
        blue: (text: string) => text.blue,
        green: (text: string) => text.green,
        yellow: (text: string) => text.yellow,
    };

    // Type for valid color names based on the colorFunctions object keys
    type ColorName = keyof typeof colorFunctions;

    // Array of colors to use in the reversed rainbow order
    const colors: ColorName[] = ['red', 'magenta', 'blue', 'green', 'yellow', 'red'];

    // Map each character of the string to its corresponding color and join them back into a string
    return str.split('')
        .map((char, i) => {
            // Determine the color for the current character
            const color = colors[i % colors.length];
            // Apply the color function to the character
            return colorFunctions[color](char);
        })
        .join('');
}
