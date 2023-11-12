import type { Message } from 'discord.js';
import { CommandInteraction, EmbedBuilder } from 'discord.js';
import type { Client } from 'discordx';
import type { MessageContentText } from 'openai/resources/beta/threads';
import 'colors';
import OpenAI from 'openai';
import Keyv from 'keyv';

const keyv = new Keyv('sqlite://src/data/db.sqlite', { namespace: 'userGptQuery' });
keyv.on('error', (err) => console.log('Connection Error', err));

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
 * @param message - The message to check.
 * @param time - The amount of time to wait before deleting the message, in milliseconds.
 * @returns void
 */
export function deletableCheck(message: Message, time: number): void {
    setTimeout(async () => {
        try {
            if (message && message.deletable) {
                await message.delete();
            }
        } catch (error) {
            // Do nothing with the error
        }
    }, time);
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
 * @param client - The Discord client.
 * @param message - The message interaction.
 * @param query - The user query to be sent to the Assistant.
 * @returns The response text from the Assistant.
 */
export async function loadAssistant(
    client: Client,
    message: Message | CommandInteraction,
    query: string,
): Promise<string |undefined> {
    const str = query.replaceAll(/<@!?(\d+)>/g, '');

    if (!str.length || str.length <= 5) {
        return 'Please enter a valid query, with a minimum length of 5 characters.';
    }

    try {
        const openai = new OpenAI({
            apiKey: process.env.OpenAiKey,
        });

        // Retrieve the Assistant information
        const assistant = await openai.beta.assistants.retrieve(`${process.env.AssistantId}`);

        // Create a new thread
        const thread = await openai.beta.threads.create();

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
        // Handling errors
        const errorEmbed = new EmbedBuilder().setColor('#EC645D').addFields([
            {
                name: `**${client.user?.username}**`,
                value: 'An error occurred, please report this to a member of our moderation team.',
            },
        ]);

        // Send an error message and log the error
        await message.reply({ embeds: [errorEmbed] });
        console.error(error);
        return undefined;
    }
}

/**
 * Sets GPT query data for a specific user.
 * @param userId - The ID of the user.
 * @param queriesRemaining - The remaining queries for the user.
 * @param expiration - The expiration timestamp for the data.
 * @returns A promise that resolves with the newly set data.
 */
export async function setGptQueryData(
    userId: string,
    queriesRemaining: number,
    expiration: number,
): Promise<{ queriesRemaining: number; expiration: number }> {
    await keyv.set(userId, { queriesRemaining, expiration });
    return { queriesRemaining, expiration };
}

/**
 * Retrieves GPT query data for a specific user.
 * @param userId - The ID of the user.
 * @returns A promise that resolves with the retrieved data or `false` if no data is found.
 */
export async function getGptQueryData(
    userId: string,
): Promise<{ queriesRemaining: number; expiration: number } | false> {
    const data = await keyv.get(userId);

    // If data exists, return it
    if (data) return data;
    // else return false
    return false;
}

/**
 * Checks GPT availability for a specific user and manages query limits.
 * @param userId - The ID of the user.
 * @returns A string indicating the reset time or a boolean for query availability.
 */
export async function checkGptAvailability(userId: string): Promise<string | boolean> {
    // Retrieve user's GPT query data from the database.
    const userQueryData = await getGptQueryData(userId);

    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + (24 * 60 * 60 * 1000));

    // User's query data exists.
    if (userQueryData) {
        // User has exhausted their query limit.
        if (userQueryData.queriesRemaining <= 0) {
            const expiration = new Date(userQueryData.expiration);

            // 24 hours have passed since the initial entry. Resetting data.
            if (currentTime > expiration) {
                await setGptQueryData(userId, 4, Number(expirationTime));
                return true;
            }

            // Queries expired, 24 hours not passed.
            // Convert the expiration time to epoch time
            const epochTime = Math.floor(Number(expiration) / 1000);

            // Return a string indicating the reset time of available queries
            return `You've used all available queries. They'll reset at <t:${epochTime}:R>.`;
        }

        // User has queries remaining, remove 1 query from the database.
        await setGptQueryData(userId, userQueryData.queriesRemaining - 1, Number(userQueryData.expiration));
        return true;
    }

    // User has no existing data. Creating a new entry.
    await setGptQueryData(userId, 4, Number(expirationTime));
    return true;
}
