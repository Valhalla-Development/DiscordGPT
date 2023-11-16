import {
    ButtonComponent,
    Client, Discord, Slash, SlashOption,
} from 'discordx';
import type { CommandInteraction } from 'discord.js';
import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ButtonBuilder,
    EmbedBuilder,
    GuildMember,
    GuildMemberRoleManager,
    ButtonStyle,
    ButtonInteraction,
} from 'discord.js';
import { Category } from '@discordx/utilities';
import { getGptQueryData, setGptQueryData } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Queries {
    private user: string | undefined;

    private db: { totalQueries: number, queriesRemaining: number; expiration: number; whitelisted: boolean;
        blacklisted: boolean } | false | undefined;

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
        if (!isStaff && userId.id !== interaction.user.id) {
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

        // Store the data for later usage.
        this.user = userId.id;
        this.db = getData;

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

        if (!getData.whitelisted) {
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('resetButton')
                .setLabel('Reset Cooldown')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('whitelistButton')
                .setLabel('Toggle Whitelist')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('blacklistButton')
                .setLabel('Toggle Blacklist')
                .setStyle(ButtonStyle.Secondary),
        );

        const embed = new EmbedBuilder()
            .setTitle(`${client.user?.username} - Query Checker`)
            .setDescription(`Viewing queries for ${userId}`)
            .setThumbnail(member?.displayAvatarURL() || '')
            .setColor('#EC645D')
            .addFields(...fields);

        if (isStaff && interaction.user.id !== userId.id) {
            await interaction.reply({ embeds: [embed], components: [row] });
            return;
        }
        await interaction.reply({ embeds: [embed] });
    }

    /**
     * Handles button click events from the "Reset Cooldown" button.
     * @param interaction - The ButtonInteraction object that represents the user's interaction with the button.
     */
    @ButtonComponent({ id: 'resetButton' })
    async buttonClicked(interaction: ButtonInteraction, client: Client) {
        const { RateLimit } = process.env;

        // Access the stored user.
        const { user, db } = this;

        const noData = new EmbedBuilder()
            .setColor('#EC645D')
            .addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** No data to reset.',
            });

        // If no data or user
        if (!db || !user) return interaction.reply({ ephemeral: true, embeds: [noData] });

        // If the user is blacklisted or whitelisted
        if (db.blacklisted || db.whitelisted) {
            const embed = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: `**◎ Error:** User is ${db.whitelisted ? 'whitelisted.' : 'blacklisted.'}`,
                });

            await interaction.reply({ ephemeral: true, embeds: [embed] });
            return;
        }

        // If the user has not used any queries
        if (db.queriesRemaining === Number(RateLimit)) return interaction.reply({ ephemeral: true, embeds: [noData] });

        // Reset cooldown
        await setGptQueryData(
            user,
            db.totalQueries,
            Number(RateLimit),
            Number(1),
            db.whitelisted,
            db.blacklisted,
        );
    }
}
