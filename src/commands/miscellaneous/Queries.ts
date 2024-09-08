import {
    ButtonComponent, Client, Discord, Slash, SlashOption,
} from 'discordx';
import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    CommandInteraction,
    EmbedBuilder,
    GuildMember,
    GuildMemberRoleManager,
    InteractionResponse,
} from 'discord.js';
import { Category } from '@discordx/utilities';
import { getGptQueryData, setGptQueryData } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Queries {
    private member: GuildMember | undefined;

    private msg: InteractionResponse | void | undefined;

    private isAdmin: boolean | undefined;

    private generateEmbed(
        member: GuildMember,
        getData: { totalQueries: number, queriesRemaining: number; expiration: number;
            whitelisted: boolean; blacklisted: boolean, threadId: string; },
        client: Client,
    ): { embed: EmbedBuilder, row: ActionRowBuilder<ButtonBuilder> } {
        const fields = [];
        const expiration = new Date(getData.expiration);
        const epochTime = Math.floor(Number(expiration) / 1000);

        fields.push({
            name: 'Total Queries',
            value: `\`${getData.totalQueries.toLocaleString()}\``,
            inline: true,
        });

        if (!getData.whitelisted && !getData.blacklisted) {
            const remaining = `${Number(process.env.RateLimit) - Number(getData.queriesRemaining)}/${process.env.RateLimit}`;
            const resetValue = getData.queriesRemaining === Number(process.env.RateLimit) ? 'N/A' : `<t:${epochTime}>`;
            fields.push(
                {
                    name: 'Queries Used',
                    value: `\`${remaining}\``,
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
                name: 'Status',
                value: `${getData.whitelisted ? '`Whitelisted`' : '`Blacklisted`'}`,
                inline: true,
            });
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('resetButton')
                .setLabel('Reset Cooldown')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(getData.whitelisted || getData.blacklisted),
            new ButtonBuilder()
                .setCustomId('blacklistButton')
                .setLabel('Toggle Blacklist')
                .setStyle(ButtonStyle.Secondary),
        );

        // Only show whitelist & delete thread button if the user is an admin.
        if (this.isAdmin) {
            row.addComponents(new ButtonBuilder()
                .setCustomId('whitelistButton')
                .setLabel('Toggle Whitelist')
                .setStyle(ButtonStyle.Secondary));

            row.addComponents(new ButtonBuilder()
                .setCustomId('deleteThreadButton')
                .setLabel('Delete Thread')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!getData.threadId || getData.threadId === ''));
        }

        const embed = new EmbedBuilder()
            .setTitle(`${client.user?.username} - Query Checker`)
            .setDescription(`Viewing queries for ${member}`)
            .setThumbnail(member?.displayAvatarURL() || '')
            .setColor('#EC645D')
            .addFields(...fields);

        return { embed, row };
    }

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
        const userId = user || interaction.user;
        const member = interaction.guild?.members.cache.get(userId.id);

        if (!member) {
            await interaction.reply({ content: '⚠️ Error fetching member.', ephemeral: true });
            return;
        }

        // Staff roles defined in env file.
        const staffRoles = process.env.StaffRoles?.split(',');
        const isStaff = staffRoles?.some((roleID) => interaction.member?.roles instanceof GuildMemberRoleManager
            && interaction.member.roles.cache.has(roleID));
        // Admins defined in env file.
        const adminIds = process.env.AdminIds?.split(',');
        const isAdmin = adminIds?.some((id) => id === interaction.user.id);
        this.isAdmin = isAdmin;

        const getData = await getGptQueryData(userId.id);

        this.member = member;

        if (!getData) {
            await interaction.reply({ content: `⚠️ No data available for ${member}.`, ephemeral: true });
            return;
        }

        const { embed, row } = this.generateEmbed(member, getData, client);

        if (isAdmin || (isStaff && interaction.user.id !== userId.id)) {
            this.msg = await interaction.reply({ embeds: [embed], components: [row] });
            return;
        }
        await interaction.reply({ embeds: [embed] });
    }

    @ButtonComponent({ id: 'resetButton' })
    async resetButtonClicked(interaction: ButtonInteraction, client: Client) {
        const { member, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) return interaction.deferUpdate();

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: '**◎ Error:** Only the command executor can select an option!',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { RateLimit } = process.env;

        const noData = new EmbedBuilder()
            .setColor('#EC645D')
            .addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** No data to reset.',
            });

        if (!member) return interaction.reply({ ephemeral: true, embeds: [noData] });

        const db = await getGptQueryData(member.id);

        if (!db) return interaction.reply({ ephemeral: true, embeds: [noData] });

        if (db.blacklisted || db.whitelisted) {
            const embed = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: `**◎ Error:** ${member} is ${db.whitelisted ? 'whitelisted.' : 'blacklisted.'}`,
                });

            await interaction.reply({ ephemeral: true, embeds: [embed] });
            return;
        }

        if (db.queriesRemaining === Number(RateLimit)) return interaction.reply({ ephemeral: true, embeds: [noData] });

        // Reset cooldown
        const newData = await setGptQueryData(
            member.id,
            db.totalQueries,
            Number(RateLimit),
            Number(1),
            db.whitelisted,
            db.blacklisted,
            db.threadId,
        );

        if (msg) {
            const { embed, row } = this.generateEmbed(member, newData, client);

            await msg.edit({ embeds: [embed], components: [row] });
            await interaction.deferUpdate();
        }
    }

    /**
     * Handles button click events from the "Toggle Whitelist" button.
     * @param interaction - The ButtonInteraction object that represents the user's interaction with the button.
     * @param client - The Discord client.
     */
    @ButtonComponent({ id: 'whitelistButton' })
    async whitelistButtonClicked(interaction: ButtonInteraction, client: Client) {
        const { member, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) return interaction.deferUpdate();

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: '**◎ Error:** Only the command executor can select an option!',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { RateLimit } = process.env;

        const noData = new EmbedBuilder()
            .setColor('#EC645D')
            .addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** No data to reset.',
            });

        if (!member) return interaction.reply({ ephemeral: true, embeds: [noData] });

        const db = await getGptQueryData(member.id);

        let newData;

        if (db) {
            // Update whitelist status
            newData = await setGptQueryData(
                member.id,
                db.totalQueries,
                Number(RateLimit),
                Number(1),
                !db.whitelisted,
                false,
                db.threadId,
            );
        } else {
            // User has no existing data. Creating a new entry.
            newData = await setGptQueryData(
                member.id,
                Number(1),
                Number(RateLimit) - Number(1),
                Number(1),
                true,
                false,
                '',
            );
        }

        if (msg) {
            const { embed, row } = this.generateEmbed(member, newData, client);

            await msg.edit({ embeds: [embed], components: [row] });
            await interaction.deferUpdate();
        }
    }

    /**
     * Handles button click events from the "Toggle Blacklist" button.
     * @param interaction - The ButtonInteraction object that represents the user's interaction with the button.
     * @param client - The Discord client.
     */
    @ButtonComponent({ id: 'blacklistButton' })
    async blacklistButtonClicked(interaction: ButtonInteraction, client: Client) {
        const { member, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) return interaction.deferUpdate();

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: '**◎ Error:** Only the command executor can select an option!',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { RateLimit } = process.env;

        const noData = new EmbedBuilder()
            .setColor('#EC645D')
            .addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** No data to reset.',
            });

        if (!member) return interaction.reply({ ephemeral: true, embeds: [noData] });

        const db = await getGptQueryData(member.id);

        let newData;

        if (db) {
            // Update blacklist status
            newData = await setGptQueryData(
                member.id,
                db.totalQueries,
                Number(RateLimit),
                Number(1),
                false,
                !db.blacklisted,
                db.threadId,
            );
        } else {
            // User has no existing data. Creating a new entry.
            newData = await setGptQueryData(
                member.id,
                Number(1),
                Number(RateLimit) - Number(1),
                Number(1),
                false,
                true,
                '',
            );
        }

        if (msg) {
            const { embed, row } = this.generateEmbed(member, newData, client);

            await msg.edit({ embeds: [embed], components: [row] });
            await interaction.deferUpdate();
        }
    }

    /**
     * Handles button click events from the "Delete Thread" button.
     * @param interaction - The ButtonInteraction object that represents the user's interaction with the button.
     * @param client - The Discord client.
     */
    @ButtonComponent({ id: 'deleteThreadButton' })
    async deleteThreadButtonClicked(interaction: ButtonInteraction, client: Client) {
        const { member, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) return interaction.deferUpdate();

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder()
                .setColor('#EC645D')
                .addFields({
                    name: `**${client.user?.username} - Query Checker**`,
                    value: '**◎ Error:** Only the command executor can select an option!',
                });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { RateLimit } = process.env;

        const noData = new EmbedBuilder()
            .setColor('#EC645D')
            .addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** No data to reset.',
            });

        if (!member) return interaction.reply({ ephemeral: true, embeds: [noData] });

        const db = await getGptQueryData(member.id);

        if (!db) return interaction.reply({ ephemeral: true, embeds: [noData] });

        // Delete thread id
        const newData = await setGptQueryData(
            member.id,
            db.totalQueries,
            Number(RateLimit),
            Number(1),
            !db.whitelisted,
            false,
            '',
        );

        if (msg) {
            const { embed, row } = this.generateEmbed(member, newData, client);

            await msg.edit({ embeds: [embed], components: [row] });
            await interaction.deferUpdate();
        }
    }
}
