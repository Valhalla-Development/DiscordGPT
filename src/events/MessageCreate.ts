import type { ArgsOf, Client } from 'discordx';
import { Discord, On } from 'discordx';
import { EmbedBuilder } from 'discord.js';
import OpenAI from 'openai';
import type { MessageContentText } from 'openai/resources/beta/threads';

@Discord()
export class MessageCreate {
    /**
     * Handler for messageCreate event.
     * @param args - An array containing the message and client objects.
     * @param client - The Discord client.
     */
    @On({ event: 'messageCreate' })
    async onMessage([message]: ArgsOf<'messageCreate'>, client: Client) {
        // Return if the author is a bot, preventing the bot from replying to itself or other bots.
        if (message.author.bot) return;

        // Direct users to the Discord server if messageCreate is triggered outside a guild.
        if (!message.guild) {
            const embed = new EmbedBuilder().setColor('#EC645D').addFields([
                {
                    name: `**${client.user?.username}**`,
                    value: 'To better assist you, please use our bot within the [AirReps Discord server](https://airreps.link/discord).\nHead over there for a seamless experience. See you on the server!',
                },
            ]);

            await message.reply({ embeds: [embed] });
        }

        // Return if no one was mentioned or the user mentioned was NOT the bot.
        if (!message.mentions.users.size || !message.mentions.has(`${client.user?.id}`)) return;

        /**
         * Load Assistant function to query the OpenAI API for a response.
         * @param query - The user query to be sent to the Assistant.
         * @returns The response text from the Assistant.
         */
        async function loadAssistant(query: string): Promise<string | undefined> {
            const str = query.replaceAll(/<@!?(\d+)>/g, '');

            if (!str.length || str.length <= 10) {
                return 'Please enter a valid query, with a minimum length of 10 characters.';
                return 'Please enter a valid query, with a minimum length of 10 characters.';
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

                return textValue;
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

        const errorEmbed = new EmbedBuilder().setColor('#EC645D').addFields([
            {
                name: `**${client.user?.username}**`,
                value: 'An error occurred, please report this to a member of our moderation team.',
            },
        ]);

        try {
            // Load the Assistant for the message content
            const res = await loadAssistant(message.content);

            // Reply with the Assistant's response
            if (res) {
                await message.reply(res);
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        } catch (e) {
            // Send an error message and log the error
            await message.reply({ embeds: [errorEmbed] });
            console.error(e);
        }
    }
}
