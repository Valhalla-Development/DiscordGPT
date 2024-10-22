import type { Client } from 'discordx';
import { Discord, Slash } from 'discordx';
import { ChannelType, CommandInteraction, EmbedBuilder } from 'discord.js';
import { Category } from '@discordx/utilities';

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
        if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

        const start = Date.now();
        await interaction.deferReply();
        const end = Date.now();

        const botLatency = Math.max(0, end - start);
        const apiLatency = Math.max(0, Math.round(client.ws.ping));

        const getLatencyEmoji = (ms: number) => {
            if (ms < 100) return '🟢';
            if (ms < 200) return '🟡';
            return '🔴';
        };

        const embed = new EmbedBuilder()
            .setColor('#e91e63')
            .setTitle(`🏓 Pong! ${client.user?.username} is online`)
            .addFields(
                {
                    name: 'Bot Latency',
                    value: `${getLatencyEmoji(botLatency)} \`${botLatency}ms\``,
                    inline: true,
                },
                {
                    name: 'API Latency',
                    value: `${getLatencyEmoji(apiLatency)} \`${apiLatency}ms\``,
                    inline: true,
                },
            );

        await interaction.editReply({ embeds: [embed] });
    }
}
