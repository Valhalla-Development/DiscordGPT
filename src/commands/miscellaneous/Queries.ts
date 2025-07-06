import { Category } from '@discordx/utilities';
import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type CommandInteraction,
    EmbedBuilder,
    type EmbedField,
    GuildMemberRoleManager,
    type InteractionResponse,
    type User,
} from 'discord.js';
import { ButtonComponent, type Client, Discord, Slash, SlashOption } from 'discordx';
import { getGptQueryData, setGptQueryData, type UserData } from '../../utils/Util.js';

@Discord()
@Category('Miscellaneous')
export class Queries {
    private user: User | undefined;

    private msg: InteractionResponse | undefined | undefined;

    private isAdmin: boolean | undefined;

    private generateEmbed(
        user: User,
        getData: {
            totalQueries: number;
            queriesRemaining: number;
            expiration: number;
            whitelisted: boolean;
            blacklisted: boolean;
            threadId: string;
        },
        client: Client
    ): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
        const fields: EmbedField[] = [];
        const expiration = new Date(getData.expiration);
        const epochTime = Math.floor(Number(expiration) / 1000);

        fields.push({
            name: 'Total Queries',
            value: `\`${getData.totalQueries.toLocaleString()}\``,
            inline: true,
        });

        if (getData.whitelisted || getData.blacklisted) {
            fields.push({
                name: 'Status',
                value: `${getData.whitelisted ? '`Whitelisted`' : '`Blacklisted`'}`,
                inline: true,
            });
        } else {
            const remaining = `${Number(process.env.MAX_QUERIES_LIMIT) - Number(getData.queriesRemaining)}/${process.env.MAX_QUERIES_LIMIT}`;
            const resetValue =
                getData.queriesRemaining === Number(process.env.MAX_QUERIES_LIMIT)
                    ? 'N/A'
                    : `<t:${epochTime}>`;
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
                }
            );
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
                .setStyle(ButtonStyle.Secondary)
        );

        // Only show whitelist & delete thread button if the user is an admin.
        if (this.isAdmin) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('whitelistButton')
                    .setLabel('Toggle Whitelist')
                    .setStyle(ButtonStyle.Secondary)
            );

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('deleteThreadButton')
                    .setLabel('Delete Thread')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!getData.threadId || getData.threadId === '')
            );
        }

        const embed = new EmbedBuilder()
            .setTitle(`${client.user?.username} - Query Checker`)
            .setDescription(`Viewing queries for ${user}`)
            .setThumbnail(user?.displayAvatarURL() || '')
            .setColor('#EC645D')
            .addFields(...fields);

        return { embed, row };
    }

    @Slash({
        description: 'Displays query information for the specified user or the message author.',
    })
    async queries(
        @SlashOption({
            description: 'User',
            name: 'user',
            required: false,
            type: ApplicationCommandOptionType.User,
        })
        targetUser: User | undefined,
        interaction: CommandInteraction,
        client: Client
    ) {
        const userId = targetUser || interaction.user;
        const user = await client.users.fetch(targetUser?.id || interaction.user.id);

        if (!user) {
            await interaction.reply({ content: '⚠️ Error fetching member.', ephemeral: true });
            return;
        }

        // Staff roles defined in env file.
        const staffRoles = process.env.STAFF_ROLE_IDS?.split(',');
        const isStaff = staffRoles?.some(
            (roleID) =>
                interaction.member?.roles instanceof GuildMemberRoleManager &&
                interaction.member.roles.cache.has(roleID)
        );

        // Admins defined in env file.
        const adminIds = process.env.ADMIN_USER_IDS?.split(',');
        const isAdmin = adminIds?.some((id) => id === interaction.user.id);
        this.isAdmin = isAdmin;

        const getData = await getGptQueryData(userId.id);

        this.user = user;

        if (!getData) {
            await interaction.reply({
                content: `⚠️ No data available for ${user}.`,
                ephemeral: true,
            });
            return;
        }

        const { embed, row } = this.generateEmbed(user, getData, client);

        if (isAdmin || (isStaff && interaction.user.id !== userId.id)) {
            this.msg = await interaction.reply({ embeds: [embed], components: [row] });
            return;
        }
        await interaction.reply({ embeds: [embed] });
    }

    @ButtonComponent({ id: 'resetButton' })
    async resetButtonClicked(interaction: ButtonInteraction, client: Client) {
        const { user, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) {
            return interaction.deferUpdate();
        }

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder().setColor('#EC645D').addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** Only the command executor can select an option!',
            });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { MAX_QUERIES_LIMIT } = process.env;

        const noData = new EmbedBuilder().setColor('#EC645D').addFields({
            name: `**${client.user?.username} - Query Checker**`,
            value: '**◎ Error:** No data to reset.',
        });

        if (!user) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        const db = await getGptQueryData(user.id);

        if (!db) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        if (db.blacklisted || db.whitelisted) {
            const embed = new EmbedBuilder().setColor('#EC645D').addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: `**◎ Error:** ${user} is ${db.whitelisted ? 'whitelisted.' : 'blacklisted.'}`,
            });

            await interaction.reply({ ephemeral: true, embeds: [embed] });
            return;
        }

        if (db.queriesRemaining === Number(MAX_QUERIES_LIMIT)) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        // Reset cooldown
        const newData = await setGptQueryData(
            user.id,
            db.totalQueries,
            Number(MAX_QUERIES_LIMIT),
            Number(1),
            db.whitelisted,
            db.blacklisted,
            db.threadId
        );

        if (msg) {
            const { embed, row } = this.generateEmbed(user, newData, client);

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
        const { user, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) {
            return interaction.deferUpdate();
        }

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder().setColor('#EC645D').addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** Only the command executor can select an option!',
            });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { MAX_QUERIES_LIMIT } = process.env;

        const noData = new EmbedBuilder().setColor('#EC645D').addFields({
            name: `**${client.user?.username} - Query Checker**`,
            value: '**◎ Error:** No data to reset.',
        });

        if (!user) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        const db = await getGptQueryData(user.id);

        let newData: UserData;

        if (db) {
            // Update whitelist status
            newData = await setGptQueryData(
                user.id,
                db.totalQueries,
                Number(MAX_QUERIES_LIMIT),
                Number(1),
                !db.whitelisted,
                false,
                db.threadId
            );
        } else {
            // User has no existing data. Creating a new entry.
            newData = await setGptQueryData(
                user.id,
                Number(1),
                Number(MAX_QUERIES_LIMIT) - Number(1),
                Number(1),
                true,
                false,
                ''
            );
        }

        if (msg) {
            const { embed, row } = this.generateEmbed(user, newData, client);

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
        const { user, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) {
            return interaction.deferUpdate();
        }

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder().setColor('#EC645D').addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** Only the command executor can select an option!',
            });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const { MAX_QUERIES_LIMIT } = process.env;

        const noData = new EmbedBuilder().setColor('#EC645D').addFields({
            name: `**${client.user?.username} - Query Checker**`,
            value: '**◎ Error:** No data to reset.',
        });

        if (!user) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        const db = await getGptQueryData(user.id);

        let newData: UserData;

        if (db) {
            // Update blacklist status
            newData = await setGptQueryData(
                user.id,
                db.totalQueries,
                Number(MAX_QUERIES_LIMIT),
                Number(1),
                false,
                !db.blacklisted,
                db.threadId
            );
        } else {
            // User has no existing data. Creating a new entry.
            newData = await setGptQueryData(
                user.id,
                Number(1),
                Number(MAX_QUERIES_LIMIT) - Number(1),
                Number(1),
                false,
                true,
                ''
            );
        }

        if (msg) {
            const { embed, row } = this.generateEmbed(user, newData, client);

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
        const { user, msg } = this;

        // Return if the interaction and msg id do not match.
        if (interaction.message.interaction?.id !== msg?.id) {
            return interaction.deferUpdate();
        }

        if (interaction.user.id !== interaction.message.interaction?.user.id) {
            const wrongUserMessage = new EmbedBuilder().setColor('#EC645D').addFields({
                name: `**${client.user?.username} - Query Checker**`,
                value: '**◎ Error:** Only the command executor can select an option!',
            });

            // Reply with an ephemeral message indicating the error
            await interaction.reply({ ephemeral: true, embeds: [wrongUserMessage] });
            return;
        }

        const noData = new EmbedBuilder().setColor('#EC645D').addFields({
            name: `**${client.user?.username} - Query Checker**`,
            value: '**◎ Error:** No data to reset.',
        });

        if (!user) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        const db = await getGptQueryData(user.id);

        if (!db) {
            return interaction.reply({ ephemeral: true, embeds: [noData] });
        }

        // Delete thread id
        const newData = await setGptQueryData(
            user.id,
            Number(db.totalQueries) || 0,
            Number(db.queriesRemaining) || 0,
            Number(db.expiration) || 0,
            db.whitelisted,
            db.blacklisted,
            ''
        );

        if (msg) {
            const { embed, row } = this.generateEmbed(user, newData, client);

            await msg.edit({ embeds: [embed], components: [row] });
            await interaction.deferUpdate();
        }
    }
}
