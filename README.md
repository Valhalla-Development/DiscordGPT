<div align="center">
  <br />
  <p>
    <img src="https://share.valhalladev.org/u/RkmYp5.png" width="550" alt="DiscordGPT" />
  </p>
  <br />
  <p>
  <a href="https://discord.gg/Q3ZhdRJ">
    <img src="https://img.shields.io/discord/495602800802398212.svg?colorB=Blue&logo=discord&label=Support&style=for-the-badge" alt="Support">
  </a>
  <a href="https://github.com/Valhalla-Development/DiscordGPT">
    <img src="https://img.shields.io/github/languages/top/Valhalla-Development/DiscordGPT.svg?style=for-the-badge" alt="Language">
  </a>
  <a href="https://github.com/Valhalla-Development/DiscordGPT/issues">
    <img src="https://img.shields.io/github/issues/Valhalla-Development/DiscordGPT.svg?style=for-the-badge" alt="Issues">
  </a>
  <a href="https://github.com/Valhalla-Development/DiscordGPT/pulls">
    <img src="https://img.shields.io/github/issues-pr/Valhalla-Development/DiscordGPT.svg?style=for-the-badge" alt="Pull Requests">
  </a>
  <a href="https://app.codacy.com/gh/Valhalla-Development/DiscordGPT/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade">
    <img src="https://img.shields.io/codacy/grade/2ff67fb8640245b79e8dfd6118840e2d?style=for-the-badge" alt="Codacy Ranking">
  </a>
  </p>
</div>

## Welcome to DiscordGPT 🤖
Your cutting-edge Discord Bot, powered by [OpenAI Assistant](https://openai.com/blog/introducing-gpts),
also known as a [Custom GPT](https://openai.com/blog/introducing-gpts) for instant,
smart, and seamless interactions.
Dive into the era of intelligent chatbots by integrating DiscordGPT with your server.
</br>Our project is based on our [custom-made Discord Bot template](https://github.com/Valhalla-Development/Bot-Template)
that awaits your contribution and creativity.

## 🚀 Included Commands

| **Command**             | **Description**                                                                          |
|-------------------------|------------------------------------------------------------------------------------------|
| **Ask**                 | Interact with the GPT by tagging the bot or using the /ask command.                      |
| **Queries**             | Provides data for specified user queries to the API.                                     |
| **Ping**                | Offers statistics about the bot's latency.                                               |
| **Help**                | Feature-rich command with a dynamic and interactive help menu using slash command links. |
| **Whitelist** *(staff)* | Add users to a whitelist, exempting them from Rate Limit and command cooldown.           |
| **Blacklist** *(staff)* | Add users to a blacklist, preventing them from making queries to the API.                |
| **Reset** *(staff)*     | Reset a user's queries cooldown for further use.                                         |

## 🤖 Bot Info

Upon startup, the bot provides a concise status report,
detailing key operational metrics such as the number of users, guilds, slash commands, events, and memory usage.
It also includes information on the Node.js and discord.js versions it's running on.

## ⚠️ Error Handling

- Logs errors to the console for debugging.
- Sends detailed error messages to a specified Discord channel (provide `LoggingChannel` in your `.env` file).

## 📊 Command Logging

Logs command usage to a specified channel (provide `CommandLogging` in your `.env` file).

## 📚 TSDoc Comments and Documentation

Thoroughly documented with TSDoc comments and explanatory notes throughout the code.

## 📘 OpenAI Integration

Don't worry; getting your bot up and running is as easy as pie 🍰 with these key links:
- [Assistant Setup](https://platform.openai.com/assistants): Select your assistant and ID.
- [API Key Generation](https://platform.openai.com/api-keys): Secure your OpenAI API key.
- [API Docs](https://platform.openai.com/docs/assistants/overview): Explore the comprehensive API guide and [reference](https://platform.openai.com/docs/api-reference/assistants).

## 🚀 Getting Started

1. Download the source by clicking on 'Releases' -> 'Latest version' -> 'Source code (zip)' or [click here](https://github.com/Valhalla-Development/DiscordGPT/releases).
2. Rename `.env.example` into `.env` and enter your environment variables.
3. Open a terminal window within the source directory, and enter the following commands:

    ```shell
    yarn install
    ```
     ```shell
    yarn start
    ```

## 📸 Peek Inside

Get visual insight into DiscordGPT's capabilities:

- **Queries Command**
  </br><img src="https://share.valhalladev.org/u/oUaAgt.png" alt="Bot Info" style="width: 500px;">
- **Query Interaction**
  </br><img src="https://share.valhalladev.org/u/nfDVGg.png" alt="Bot Info" style="width: 500px;">
- **Bot Info**
  </br><img src="https://share.valhalladev.org/u/eB587n.png" alt="Bot Info" style="width: 500px;">
- **Error Handling**
  </br><img src="https://share.valhalladev.org/u/Raxmmv.png" alt="Error Handler" style="width: 300px;">
- **Command Logging**
  </br><img src="https://share.valhalladev.org/u/rsRWEI.png" alt="Command Logger" style="width: 400px;">
- **Help Misc Command**
  </br><img src="https://share.valhalladev.org/u/Pb5cZM.png" alt="Help" style="width: 400px;">
- **Help Staff Command**
  </br><img src="https://share.valhalladev.org/u/KdeYHr.png" alt="Help" style="width: 400px;">

Embark on your DiscordGPT journey with us, and witness your server transformed by the power of AI! 🚀

---

Still got questions or ready to contribute? Jump into our [Discord](https://discord.gg/Q3ZhdRJ) and let's make some magic happen! ✨ here
