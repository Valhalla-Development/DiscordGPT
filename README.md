# Discord Bot Template

<div align="center">
  <a href="https://discord.gg/Q3ZhdRJ">
    <img src="https://img.shields.io/discord/495602800802398212.svg?colorB=Blue&logo=discord&label=Support&style=for-the-badge" alt="Support">
  </a>
  <a href="https://github.com/Valhalla-Development/Bot-Template">
    <img src="https://img.shields.io/github/languages/top/Valhalla-Development/Bot-Template.svg?style=for-the-badge" alt="Language">
  </a>
  <a href="https://github.com/Valhalla-Development/Bot-Template/issues">
    <img src="https://img.shields.io/github/issues/Valhalla-Development/Bot-Template.svg?style=for-the-badge" alt="Issues">
  </a>
  <a href="https://github.com/Valhalla-Development/Bot-Template/pulls">
    <img src="https://img.shields.io/github/issues-pr/Valhalla-Development/Bot-Template.svg?style=for-the-badge" alt="Pull Requests">
  </a>
  <a href="https://app.codacy.com/gh/Valhalla-Development/Bot-Template/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade">
    <img src="https://img.shields.io/codacy/grade/49b97351b8604c9a904991e633afc0be?style=for-the-badge" alt="Codacy Ranking">
  </a>
</div>

This project provides a template for creating a Discord bot using [discordx](https://discord-x.js.org/) and [discord.js v14](https://discord.js.org/).

## Features (View the bottom of this page to view screenshots)

- **Bot Info:** Upon startup, the bot provides a concise status report, detailing key operational metrics such as the number of users, guilds, slash commands, events, and memory usage, as well as the Node.js and discord.js versions it's running on.
- **Error Handling:** This template comes with a robust error handling system. It logs errors to the console for debugging and can send detailed error messages to a specific Discord channel. These messages are neatly formatted within a Discord embed for easy readability. To enable this feature, provide the `LoggingChannel` variable in your `.env` file with the ID of the desired channel.
- **Command Logging:** Similar to error handling, this template offers the ability to log command usage. It can send formatted embeds to a channel of your choice. To enable this feature, provide the `CommandLogging` variable in your `.env` file with the ID of the desired channel.
- **TSDoc Comments and Documentation:** The bot template is thoroughly documented with TSDoc comments and includes explanatory comments throughout the code. These comments and documentation serve as a helpful resource to understand how different components and functionalities of the bot work.
- **Included Commands:** The template comes with two built-in commands:
    - **Ping Command:** This command provides statistics about the latency of your bot, giving you insights into its responsiveness.
    - **Help Command:** The help command is a feature-rich command built from the ground up. It utilizes slash command links to generate a dynamic and interactive help menu, making it easy for users to explore and understand the available commands.

These features provide a solid foundation for building and customizing your Discord bot while ensuring good documentation and error handling for a smooth user experience.

## Setup

1. Download the source by clicking on 'Releases' -> 'Latest version' -> 'Source code (zip)' or [click here](https://github.com/Valhalla-Development/Bot-Template/releases).
2. Extract the zip using an archive tool of your choice.
3. Inside the extracted folder, you will find a file named `.env.example`. Rename it to `.env` and fill in the necessary values. If you're unsure where to find your bot token and owner ID, refer to these links: [bot token](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) | [owner ID](https://support.discordapp.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-).
4. Open a console window in the root directory of the bot and run the following commands:

```shell
$ yarn install  # Installs the required modules. Once completed, run the next command:
$ yarn build    # Builds the source.
$ yarn start    # Starts your bot. You are now ready to use your bot!
```

## Screenshots

Screenshots related to the Features mentioned in this page.

- Bot Info 
</br><img src="https://www.ragnarokbot.com/upload/files/Screenshot_2023-06-22_at_16.11.31_1687446698.png" alt="Bot Info" style="width: 500px;">
- Error Handling
</br><img src="https://www.ragnarokbot.com/upload/files/Screenshot_2023-06-22_at_16.44.28_1687448678.png" alt="Error Handler" style="width: 300px;">
- Command Logging
</br><img src="https://www.ragnarokbot.com/upload/files/Screenshot_2023-06-22_at_16.45.43_1687448753.png" alt="Command Logger" style="width: 400px;">
- Help Command
</br><img src="https://www.ragnarokbot.com/upload/files/Screenshot_2023-06-22_at_16.46.35_1687448803.png" alt="Help" style="width: 400px;">
