import type { Client } from 'discordx';
import { Discord, Slash } from 'discordx';
import type { CommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { Category } from '@discordx/utilities';
import { deletableCheck } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Ping {
    /**
     * Displays ping information for the bot.
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Displays bot and API ping.' })
    async ping(interaction: CommandInteraction, client: Client): Promise<void> {
        if (!interaction.channel) return;

        const msg = await interaction.channel.send({ content: 'Pinging...' });
        const latency = msg.createdTimestamp - interaction.createdTimestamp;
        deletableCheck(msg, 0);

        const embed = new EmbedBuilder().setColor('#e91e63').addFields([
            {
                name: `**${client.user?.username} - Ping**`,
                value: `**◎ Bot Latency:** \`${latency}ms\`
          **◎ API Latency:** \`${Math.round(client.ws.ping)}ms\``,
            },
        ]);

        await interaction.reply({ embeds: [embed] });
    }
}
