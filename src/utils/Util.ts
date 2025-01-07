import {
    AttachmentBuilder,
    ChannelType,
    codeBlock,
    CommandInteraction,
    EmbedBuilder,
    Guild,
    GuildTextBasedChannel,
    Message,
    PublicThreadChannel,
    TextChannel,
    ThreadAutoArchiveDuration,
    ThreadChannel,
    User,
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
    whitelisted: boolean;
    blacklisted: boolean;
    threadId: string;
}

interface EntryValue {
    userId?: string;
    totalQueries: number;
}

const keyv = new Keyv({ store: new KeyvSqlite({ uri: 'sqlite://src/data/db.sqlite' }), namespace: 'userData' });
keyv.on('error', (err) => console.log('[keyv] Connection Error', err));

/**
 * Capitalizes the first letter of each word in a string.
 * @param str - The string to be capitalized.
 * @returns The capitalized string.
 */
export const capitalise = (str: string): string => str.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Deletes a message after a specified delay if it's deletable.
 * @param message - The message to delete.
 * @param delay - The delay before deletion, in milliseconds.
 */
export function messageDelete(message: Message, delay: number): void {
    setTimeout(() => {
        message.delete().catch((error) => console.error('Error deleting message:', error));
    }, delay);
}

/**
 * Fetches all registered global application command IDs.
 * @param client - The Discord client instance.
 * @returns A Promise that resolves to a record of command names to their corresponding IDs.
 * @throws Error if unable to fetch commands or if the client's application is not available.
 */
export async function getCommandIds(client: Client): Promise<Record<string, string>> {
    if (!client.application) {
        throw new Error('Client application is not available');
    }

    try {
        const commands = await client.application.commands.fetch();
        return Object.fromEntries(commands.map((c) => [c.name, c.id]));
    } catch (error) {
        console.error('Error fetching global commands:', error);
        throw error;
    }
}

/**
 * Loads an AI assistant to process a user query.
 * @param query - The user's input query string.
 * @param user - The user object containing user information.
 * @returns A promise that resolves to either a string, an array of strings,
 *          a boolean, or an Error object.
 */
export async function loadAssistant(
    query: string,
    user: User,
): Promise<string | string[] | Error | boolean> {
    const userQueryData = await getGptQueryData(user.id);
    const str = query.replace(/<@!?(\d+)>/g, '');

    if (str.length < 4) return 'Please enter a valid query, with a minimum length of 4 characters.';

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const assistant = await openai.beta.assistants.retrieve(process.env.OPENAI_ASSISTANT_ID!);

        // Fetch existing thread or create a new one
        let thread: OpenAI.Beta.Threads.Thread;
        try {
            thread = userQueryData && userQueryData.threadId
                ? await openai.beta.threads.retrieve(userQueryData.threadId)
                : await openai.beta.threads.create();
        } catch {
            thread = await openai.beta.threads.create();
        }

        // Update user query data if necessary
        if (userQueryData && userQueryData.threadId !== thread.id) {
            await setGptQueryData(
                user.id,
                Number(userQueryData.totalQueries) || 0,
                Number(userQueryData.queriesRemaining) || 0,
                Number(userQueryData.expiration) || 0,
                userQueryData.whitelisted || false,
                userQueryData.blacklisted || false,
                thread.id,
            );
        }

        // Check for existing run
        const existingRun = await openai.beta.threads.runs.list(thread.id)
            .then((response) => ['queued', 'in_progress'].includes(response?.data?.[0]?.status))
            .catch(() => false);

        if (existingRun) return true;

        // Create a new message and run
        await openai.beta.threads.messages.create(thread.id, { role: 'user', content: str });
        const run = await openai.beta.threads.runs.create(thread.id, { assistant_id: assistant.id });

        console.log(
            `${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
            + `${'🚀 Query initiated by '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}\n`
            + `${'📝 Query: '.brightBlue.bold}${str.brightYellow.bold}`,
        );

        // Wait for completion
        const waitForCompletion = async (): Promise<void> => {
            const retrieve = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            console.log(retrieve.status === 'completed'
                ? `${'✅ Status: '.brightBlue.bold}${retrieve.status.brightGreen.bold}`
                : `${'🔄 Status: '.brightBlue.bold}${retrieve.status.brightYellow.bold}`);

            if (retrieve.status === 'completed') return;
            if (!['in_progress', 'queued'].includes(retrieve.status)) {
                throw new Error(`completion\nStatus: ${retrieve.status}${retrieve.last_error ? `\nError Code: ${retrieve.last_error.code}` : ''}`);
            }
            await new Promise((resolve) => { setTimeout(resolve, 2000); });
            await waitForCompletion();
        };

        await waitForCompletion();

        console.log(`${'🎉 Completed query for '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}\n`);

        // Process and return response
        const messages = await openai.beta.threads.messages.list(thread.id);
        const textValue = (messages.data[0].content[0] as TextContentBlock)?.text?.value;
        const responseText = processString(textValue);

        return responseText.length >= 1950
            ? splitMessages(responseText, 1950)
            : responseText;
    } catch (error) {
        console.error(error);
        return error as Error;
    }
}

/**
 * Generates text-to-speech audio from a given string for a user.
 * @param str - The text to convert to speech.
 * @param user - The user requesting the text-to-speech conversion.
 * @returns A Promise that resolves to an AttachmentBuilder with the audio,
 *          a string error message if the user has no available queries,
 *          or an Error if the TTS generation fails.
 */
export async function runTTS(str: string, user: User): Promise<AttachmentBuilder | string | Error> {
    // Check if the user has available queries
    const availabilityCheck = await checkGptAvailability(user.id);
    if (typeof availabilityCheck === 'string') return availabilityCheck;

    try {
        // Log the start of the TTS process with colorful formatting
        console.log(`${'◆◆◆◆◆◆'.rainbow.bold} ${moment().format('MMM D, h:mm A')} ${reversedRainbow('◆◆◆◆◆◆')}\n`
            + `${'🚀 Text-to-Speech initiated by '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}`);

        // Initialize OpenAI client
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Generate TTS using OpenAI's API
        const tts = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'echo',
            input: str,
        });

        // Log completion of TTS generation
        console.log(`${'🎉 Completed text-to-speech for '.brightBlue.bold}${user.displayName.underline.brightMagenta.bold}`);

        // Convert the audio to a Discord-compatible attachment
        return new AttachmentBuilder(Buffer.from(await tts.arrayBuffer()), { name: 'tts.mp3' });
    } catch (error) {
        console.error(error);
        return error as Error;
    }
}

/**
 * Sets GPT query data for a specific user.
 * @param userId - The ID of the user.
 * @param totalQueries - Total number of queries made by the user.
 * @param queriesRemaining - Number of queries remaining for the user.
 * @param expiration - Timestamp for when the user's query allowance expires.
 * @param whitelisted - Whether the user is whitelisted.
 * @param blacklisted - Whether the user is blacklisted.
 * @param threadId - The thread ID associated with the user's conversation.
 * @returns A promise that resolves with the newly set user data.
 */
export async function setGptQueryData(
    userId: string,
    totalQueries: number,
    queriesRemaining: number,
    expiration: number,
    whitelisted: boolean,
    blacklisted: boolean,
    threadId: string,
): Promise<UserData> {
    // Create a UserData object with the provided parameters
    const data: UserData = {
        totalQueries,
        queriesRemaining,
        expiration,
        whitelisted,
        blacklisted,
        threadId,
    };

    // Store the user data in the key-value store
    await keyv.set(userId, data);

    // Return the stored data
    return data;
}

/**
 * Retrieves GPT query data for a specific user.
 * @param userId - The unique identifier of the user.
 * @returns The user's query data, or false if no data is found.
 */
export async function getGptQueryData(userId: string): Promise<UserData | false> {
    const data = await keyv.get(userId) as UserData | null;
    return data || false;
}

/**
 * Checks GPT availability for a specific user and manages query limits.
 * @param userId - The ID of the user.
 * @returns A string indicating the reset time or a boolean for query availability.
 */
export async function checkGptAvailability(userId: string): Promise<string | boolean> {
    // Parse the rate limit from environment variables
    const MAX_QUERIES_LIMIT = Number(process.env.MAX_QUERIES_LIMIT);

    // Retrieve user's GPT query data from the database
    const userQueryData = await getGptQueryData(userId);

    // Calculate current time and expiration time (24 hours from now)
    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000);

    // If the user has no existing data, create a new entry
    if (!userQueryData) {
        await setGptQueryData(
            userId,
            1,
            MAX_QUERIES_LIMIT - 1,
            expirationTime.getTime(),
            false,
            false,
            '',
        );
        return true; // User can make a query
    }

    // If the user is blacklisted, deny access
    if (userQueryData.blacklisted) {
        return 'You are currently blacklisted. If you believe this is a mistake, please contact a moderator.';
    }

    // If the user is whitelisted, allow query and reset their limit
    if (userQueryData.whitelisted) {
        await setGptQueryData(
            userId,
            userQueryData.totalQueries + 1,
            MAX_QUERIES_LIMIT,
            1,
            userQueryData.whitelisted,
            userQueryData.blacklisted,
            userQueryData.threadId,
        );
        return true;
    }

    // Check if the user has exhausted their query limit
    if (userQueryData.queriesRemaining <= 0) {
        const expiration = new Date(userQueryData.expiration);

        // If 24 hours have passed since the last query, reset the user's limit
        if (currentTime > expiration) {
            await setGptQueryData(
                userId,
                userQueryData.totalQueries + 1,
                MAX_QUERIES_LIMIT,
                expirationTime.getTime(),
                userQueryData.whitelisted,
                userQueryData.blacklisted,
                userQueryData.threadId,
            );
            return true;
        }

        // If the query limit is still active, return a message with the reset time
        return `It looks like you've reached your query limit for now. Don't worry, your queries will reset <t:${Math.floor(expiration.getTime() / 1000)}:R>`;
    }

    // User has queries remaining, update their data
    await setGptQueryData(
        userId,
        userQueryData.totalQueries + 1,
        userQueryData.queriesRemaining - 1,
        userQueryData.expiration === 1 ? expirationTime.getTime() : userQueryData.expiration,
        userQueryData.whitelisted,
        userQueryData.blacklisted,
        userQueryData.threadId,
    );
    return true;
}

/**
 * Runs the GPT assistant for the specified user and content.
 * @param content - The content for the GPT assistant.
 * @param user - The User object for the target.
 * @returns A promise that resolves to a string, array of strings, or boolean.
 * @throws An error if there's an issue with the GPT assistant or user queries.
 */
export async function runGPT(content: string, user: User): Promise<string | string[] | boolean> {
    // Check if the user has available queries
    const isGptAvailable = await checkGptAvailability(user.id);
    if (typeof isGptAvailable === 'string') return isGptAvailable;

    // Load the Assistant for the message content
    const response = await loadAssistant(content.trim(), user);

    // Handle different response types
    if (typeof response === 'boolean' || typeof response === 'string' || Array.isArray(response)) {
        return response;
    }

    // If the response is neither boolean, string, nor array, it's considered an error
    return `An error occurred, please report this to a member of our moderation team.\n${codeBlock('ts', `${response}`)}`;
}

/**
 * Splits a given content string into chunks of a specified size, ensuring words are not cut.
 * Each chunk is appended with a page number and the total number of chunks.
 * @param content - The input string to be split.
 * @param length - The desired length of each chunk.
 * @returns An array of strings representing the split content.
 */
export function splitMessages(content: string, length: number): string[] {
    const chunks: string[] = [];
    let remainingContent = content.trim();

    while (remainingContent.length > 0) {
        const chunkEnd = remainingContent.length <= length
            ? remainingContent.length
            : remainingContent.lastIndexOf(' ', length) || remainingContent.indexOf(' ', length);

        chunks.push(remainingContent.slice(0, chunkEnd).trim());
        remainingContent = remainingContent.slice(chunkEnd).trim();
    }

    const totalChunks = chunks.length;
    return chunks.map((chunk, index) => `${chunk}\n\`${index + 1}\`/\`${totalChunks}\``);
}

/**
 * Processes a string by removing specific brackets and formatting links based on environment variables.
 * @param str - The input string to process.
 * @returns The processed string.
 */
export function processString(str: string): string {
    const embedLinks = process.env.ENABLE_EMBED_LINKS !== 'false';

    return str.replace(/【.*?】/g, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => (text === url
            ? embedLinks ? url : `<${url}>`
            : embedLinks ? `[${text}](${url})` : `[${text}](<${url}>)`));
}

/**
 * Iterates through entries from a key-value store, calculates the total queries sum,
 * and returns the top 10 entries sorted by the number of queries in descending order.
 *
 * @returns A Promise that resolves to an object containing the total queries sum and
 *          an array of the top 10 entries, or an Error if something goes wrong.
 */
export async function fetchAllData(): Promise<{ totalQueriesSum: number; top10Entries: EntryValue[] } | Error> {
    const entries: EntryValue[] = [];
    let totalQueriesSum = 0;

    try {
        // @ts-expect-error temp
        for await (const [key, { totalQueries }] of keyv.iterator()) {
            entries.push({ totalQueries, userId: key });
            totalQueriesSum += totalQueries;
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
 * @param str - The string to apply the reversed rainbow effect.
 * @returns The input string with reversed rainbow coloring.
 */
export const reversedRainbow = (str: string): string => {
    const colors = ['red', 'magenta', 'blue', 'green', 'yellow', 'red'] as const;
    return str
        .split('')
        .map((char, i) => char[colors[i % colors.length] as keyof typeof char])
        .join('');
};

/**
 * Handles given error by logging it and optionally sending it to a Discord channel.
 * @param client - The Discord client instance
 * @param error - The unknown error
 */
export async function handleError(client: Client, error: unknown): Promise<void> {
    if (!(error instanceof Error) || !error.stack) {
        console.error('Invalid error object:', error);
        return;
    }

    console.error(error);

    if (process.env.ENABLE_LOGGING?.toLowerCase() !== 'true' || !process.env.ERROR_LOGGING_CHANNEL) return;

    /**
     * Truncates the description if it exceeds the maximum length.
     * @param description - The description to truncate
     * @returns The truncated description
     */
    function truncateDescription(description: string): string {
        const maxLength = 4096;
        if (description.length <= maxLength) return description;

        const numTruncatedChars = description.length - maxLength;
        return `${description.slice(0, maxLength)}... ${numTruncatedChars} more`;
    }

    try {
        const channel = client.channels.cache.get(process.env.ERROR_LOGGING_CHANNEL) as TextChannel | undefined;

        if (!channel || channel.type !== ChannelType.GuildText) {
            console.error(`Invalid logging channel: ${process.env.ERROR_LOGGING_CHANNEL}`);
            return;
        }

        const typeOfError = error.name || 'Unknown Error';
        const fullError = error.stack;
        const timeOfError = `<t:${Math.floor(Date.now() / 1000)}>`;

        const fullString = [
            `From: \`${typeOfError}\``,
            `Time: ${timeOfError}`,
            '',
            'Error:',
            codeBlock('js', fullError),
        ].join('\n');

        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(truncateDescription(fullString))
            .setColor('#FF0000');

        await channel.send({ embeds: [embed] });
    } catch (sendError) {
        console.error('Failed to send the error embed:', sendError);
    }
}

type ThreadContext = {
    source: Message | CommandInteraction;
    client: Client;
    user: User;
    query?: string;
    commandUsageChannel?: string;
};

/**
 * Unified thread management for both message events and slash commands
 * @param context - The context object containing necessary information
 * @returns Promise<boolean> - true if the thread was handled, false otherwise
 */
export async function handleThreadCreation(context: ThreadContext): Promise<boolean> {
    const {
        source, client, user, query, commandUsageChannel,
    } = context;
    const threadName = `Conversation with ${user.username}`;
    const { guild } = source;

    // Check if in existing thread and validate ownership
    if (source.channel?.isThread()) {
        const thread = source.channel as PublicThreadChannel;
        const threadOwnerName = thread.name.match(/Conversation with (.+)/)?.[1];

        if (threadOwnerName && user.username !== threadOwnerName) {
            let responseContent = 'Please create your own thread to interact with me.';

            if (commandUsageChannel) {
                try {
                    const channel = await client.channels.fetch(commandUsageChannel);
                    if (channel?.isTextBased()) {
                        responseContent = `Please create your own thread to interact with me in ${channel}.`;
                    }
                } catch {
                    // Do nothing if channel fetch fails
                }
            }

            if (source instanceof CommandInteraction) {
                await source.editReply({ content: responseContent });
            } else {
                await source.reply({ content: responseContent });
            }
            return true;
        }
    }

    // Check for existing active thread
    try {
        const activeThreads = await guild?.channels.fetchActiveThreads();
        const existingThread = Array.from(activeThreads?.threads.values() ?? []).find(
            (thread) => thread.name === threadName && !thread.archived && !thread.locked,
        );

        if (existingThread) {
            const threadUrl = getThreadUrl(guild!, existingThread);

            // Immediately notify user that we're processing their message
            const processingMessage = `Processing your request in your existing thread: ${threadUrl}`;
            if (source instanceof CommandInteraction) {
                await source.editReply({ content: processingMessage });
            } else {
                await source.reply({ content: processingMessage });
            }

            // Forward the query to the existing thread
            if (query) {
                await existingThread.send({
                    content: `**${user.displayName}'s query:** ${query}\n\n`,
                });
                const initialMessage = await existingThread.send({ content: 'Generating response...' });

                await existingThread.sendTyping();

                const response = await runGPT(query, user);

                // Handle the response
                if (typeof response === 'boolean') {
                    if (response) {
                        await initialMessage.edit({
                            content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client.user}`,
                        });
                    }
                } else if (response === query.replace(/<@!?(\d+)>/g, '')) {
                    await initialMessage.edit({
                        content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                    });
                } else if (Array.isArray(response)) {
                    await initialMessage.edit({ content: response[0] });
                    await existingThread.send({ content: response[1] });
                } else if (typeof response === 'string') {
                    await initialMessage.edit({ content: response });
                }
            }
            return true;
        }

        // Validate query length if provided
        const contentStripped = query?.replace(/<@!?(\d+)>/g, '').trim() ?? '';
        if (contentStripped.length < 4) {
            const response = 'Please enter a valid query, with a minimum length of 4 characters.';
            if (source instanceof CommandInteraction) {
                await source.editReply({ content: response });
            } else {
                await source.reply({ content: response });
            }
            return true;
        }

        // Create new thread
        if (!source.channel?.isTextBased() || source.channel.isDMBased()) {
            throw new Error('Cannot create threads in DM channels');
        }

        // Clean up original interaction if it's a slash command
        if (source instanceof CommandInteraction) {
            await source.deleteReply();
        }

        const thread = source instanceof CommandInteraction
            ? await (source.channel.type === ChannelType.GuildText
                ? source.channel.threads.create({
                    name: threadName,
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
                    reason: `Thread created for conversation with ${user.tag}`,
                })
                : null)
            : await (source.channel.type === ChannelType.GuildText
                ? (source as Message).startThread({
                    name: threadName,
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
                    reason: `Thread created for conversation with ${user.tag}`,
                })
                : null);

        if (!thread) {
            throw new Error('Failed to create thread: Invalid channel type');
        }

        // Add user to thread
        await thread.members.add(user.id);

        // Handle initial messages
        if (query) {
            await thread.send({
                content: `**${user.displayName}'s query:** ${query}\n\n`,
            });
            const initialMessage = await thread.send({ content: 'Generating response...' });
            const response = await runGPT(query, user);

            // Handle the response
            if (typeof response === 'boolean') {
                if (response) {
                    await initialMessage.edit({
                        content: `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client.user}`,
                    });
                }
                return true;
            }

            if (response === query.replace(/<@!?(\d+)>/g, '')) {
                await initialMessage.edit({
                    content: `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`,
                });
                return true;
            }

            // Send response in thread
            if (Array.isArray(response)) {
                await initialMessage.edit({ content: response[0] });
                await thread.send({ content: response[1] });
            } else if (typeof response === 'string') {
                await initialMessage.edit({ content: response });
            }
        }

        return true;
    } catch (error) {
        console.error('Error in thread creation:', error);
        await handleError(client, error);

        const errorMessage = 'Sorry, I couldn\'t create a thread. Please try again later or contact support.';
        if (source instanceof CommandInteraction) {
            await source.editReply({ content: errorMessage });
        } else {
            await source.reply({ content: errorMessage });
        }
        return true;
    }
}

/**
 * Handles GPT response processing and message sending
 * @param response - The response from GPT
 * @param source - The original message or interaction
 * @param client - The Discord client
 * @param editMessage - Optional message to edit instead of replying
 */
export async function handleGPTResponse(
    response: string | string[] | boolean,
    source: Message | CommandInteraction,
    client: Client,
    editMessage?: Message,
): Promise<void> {
    try {
        const content = source instanceof Message
            ? source.content
            : source.options.get('query')?.value as string || '';

        // Handle boolean response (usually rate limiting)
        if (typeof response === 'boolean') {
            if (response) {
                const message = `You currently have an ongoing request. Please refrain from sending additional queries to avoid spamming ${client.user}`;
                await replyToSource(source, { content: message }, editMessage);
            }
            return;
        }

        // Handle error where response equals input
        if (response === content.replace(/<@!?(\d+)>/g, '')) {
            const message = `An error occurred, please report this to a member of our moderation team.\n${codeBlock('js', 'Error: Response was equal to query.')}`;
            await replyToSource(source, { content: message }, editMessage);
            return;
        }

        // Handle array or string response
        if (Array.isArray(response)) {
            if (editMessage) {
                await editMessage.edit({ content: response[0] });
                await (editMessage.channel as GuildTextBasedChannel | PublicThreadChannel).send({ content: response[1] });
            } else if (source instanceof CommandInteraction) {
                await source.editReply({ content: response[0] });
                await source.followUp({ content: response[1] });
            } else {
                const textChannel = source.channel?.isTextBased() && 'send' in source.channel
                    ? source.channel
                    : null;

                if (!textChannel) {
                    throw new Error('Cannot send message: Channel is not text-based or does not support sending messages');
                }

                await source.reply({ content: response[0] });
                await textChannel.send({ content: response[1] });
            }
        } else {
            await replyToSource(source, { content: response }, editMessage);
        }
    } catch (error) {
        console.error('Error handling GPT response:', error);
        const errorMessage = 'Sorry, something went wrong while processing your request.';
        await replyToSource(source, { content: errorMessage }, editMessage);
    }
}

/**
 * Helper function to handle replies for both Message and CommandInteraction
 */
async function replyToSource(
    source: Message | CommandInteraction,
    options: { content: string },
    editMessage?: Message,
): Promise<void> {
    if (editMessage) {
        await editMessage.edit(options);
    } else if (source instanceof CommandInteraction) {
        await source.editReply(options);
    } else {
        await source.reply(options);
    }
}

function getThreadUrl(guild: Guild, thread: ThreadChannel): string {
    return `https://discord.com/channels/${guild.id}/${thread.id}/${thread.id}`;
}
