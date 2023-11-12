import type { ArgsOf, Client } from 'discordx';
import type { Message } from 'discord.js';
import { Discord, On } from 'discordx';
import { EmbedBuilder } from 'discord.js';
import { checkGptAvailability, deletableCheck, loadAssistant } from '../utils/Util.js';

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

        // Regex to match content less than or equal to 100, and ends with a question mark
        const regex = /^.{5,100}\?$/;

        // Respond to messages with a 15% chance if they end with a question mark and is less than 100 characters
        const chance = Math.random();
        if (chance <= 0.04) {
            if (regex.test(message.content)) {
                // Query AirRepsGPT
                await runGPT(message.content, message);
                return;
            }
        }

        // Trigger the GPT provider when pinging AirRepsGPT in a reply to another user.
        if (message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(`${message.reference.messageId}`);

                // Process the message content as a reply to the bot itself.
                if (repliedMessage && (message.author.id !== client.user?.id && repliedMessage.author.id === client.user?.id)) {
                    await runGPT(message.content, message);
                    return;
                }

                // Stop if no user was mentioned or if the mentioned user is not the bot.
                if (!message.mentions.users.size || !message.mentions.has(`${client.user?.id}`)) return;

                if (repliedMessage && (!repliedMessage.author.bot && message.author.id !== client.user?.id)) {
                    // Check if the user has available queries.
                    const check = await checkGptAvailability(repliedMessage.author.id);

                    if (typeof check === 'string') {
                        // Replace pronouns and respond to the referenced message user's query status.
                        await message.reply(check
                            .replace('you\'ve', `${repliedMessage.author} has`)
                            .replaceAll('your', 'their')).then((msg) => deletableCheck(msg, 6000));
                        return;
                    }

                    // If the query limit is not reached, run GPT on the referenced message content.
                    await runGPT(repliedMessage.content, repliedMessage);
                    return;
                }

                // Process the current message if no referenced message is found or self-response is detected.
                await runGPT(message.content, message);
                return;
            } catch (e) {
                console.error('Error fetching or processing the replied message:', e);
            }
        }

        // Stop if no user was mentioned or if the mentioned user is not the bot.
        if (!message.mentions.users.size || !message.mentions.has(`${client.user?.id}`)) return;

        const errorEmbed = new EmbedBuilder().setColor('#EC645D').addFields([
            {
                name: `**${client.user?.username}**`,
                value: 'An error occurred, please report this to a member of our moderation team.',
            },
        ]);

        await runGPT(message.content, message);

        async function runGPT(cnt: string, msg: Message) {
            try {
                // Check if the user has available queries.
                const check = await checkGptAvailability(message.author?.id);
                if (typeof check === 'string') {
                    await message.reply(check).then((ms) => setTimeout(() => ms.delete(), 6000));
                    return;
                }

                await message.channel.sendTyping();

                // Load the Assistant for the message content
                const res = await loadAssistant(client, message, cnt);

                // Reply with the Assistant's response
                if (res) {
                    await msg.reply(res);
                } else {
                    await msg.reply({ embeds: [errorEmbed] });
                }
            } catch (e) {
                // Send an error message and log the error
                await msg.reply({ embeds: [errorEmbed] });
                console.error(e);
            }
        }
    }
}
