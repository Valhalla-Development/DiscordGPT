import {
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import type { CommandInteraction } from 'discord.js';
import {
    ApplicationCommandOptionType, EmbedBuilder, GuildMember, GuildMemberRoleManager,
} from 'discord.js';
import { Category } from '@discordx/utilities';
import { getGptQueryData, getGptWhitelist } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Queries {
    /**
     * Displays query information for the specified user or the message author.
     * @param user - The optional user to lookup.
     * @param interaction - The command interaction.
     * @param client - The Discord client.
     */
    @Slash({ description: 'Displays query information for the specified user or the message author.' })
    async queries(
        @SlashOption({
            description: 'User',
            name: 'user',
            required: false,
            type: ApplicationCommandOptionType.User,
        })
            user: GuildMember | undefined,
            interaction: CommandInteraction,
            client: Client,
    ) {
        if (!interaction.channel) return;

        const userId = user || interaction.user;
        const member = interaction.guild?.members.cache.get(userId.id);

        // Don't allow non-staff to view other user query data.
        const staffRoles = process.env.StaffRoles?.split(',');
        const isStaff = staffRoles?.some((roleID) => interaction.member?.roles instanceof GuildMemberRoleManager
            && interaction.member.roles.cache.has(roleID));
        if (isStaff && userId.id !== interaction.user.id) {
            const notStaff = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: '**◎ Error:** Only staff members can view other users queries',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [notStaff] });
            return;
        }

        const getData = await getGptQueryData(userId.id);
        const getWhitelist = await getGptWhitelist(userId.id);

        if (!getData) {
            await interaction.reply({ content: `⚠️ No data available for ${member}.`, ephemeral: true });
            return;
        }

        const fields = [];
        const expiration = new Date(getData.expiration);
        const epochTime = Math.floor(Number(expiration) / 1000);

        fields.push({
            name: 'Total Queries',
            value: getData.totalQueries.toLocaleString(),
            inline: true,
        });

        if (!getWhitelist) {
            const remaining = `${Number(process.env.RateLimit) - Number(getData.queriesRemaining)}/${process.env.RateLimit}`;
            const resetValue = getData.queriesRemaining === Number(process.env.RateLimit) ? 'N/A' : `<t:${epochTime}>`;
            fields.push(
                {
                    name: 'Queries Used',
                    value: remaining,
                    inline: true,
                },
                {
                    name: 'Query Reset',
                    value: resetValue,
                    inline: true,
                },
            );
        } else {
            fields.push({
                name: 'Whitelist Status',
                value: 'Whitelisted',
                inline: true,
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${client.user?.username} - Query Checker`)
            .setDescription(`Viewing queries for ${userId}`)
            .setThumbnail(member?.displayAvatarURL() || '')
            .setColor('#EC645D')
            .addFields(...fields);

        await interaction.reply({ embeds: [embed] });
    }
}
