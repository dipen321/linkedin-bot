# LinkedIn Job Monitor Discord Bot

A Discord bot that monitors LinkedIn for new software engineer job postings and sends notifications to a Discord channel.

## Features

- Automatically checks LinkedIn for new software engineer job postings
- Sends notifications to a specified Discord channel
- Filters for experience level (Entry Level, Associate, etc.)
- Avoids duplicate notifications
- Customizable check interval

## Setup Instructions

### Prerequisites

- Node.js (v16.9.0 or higher)
- A Discord account and server
- A Discord bot token

### Step 1: Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" tab and click "Add Bot"
4. Under the "TOKEN" section, click "Copy" to copy your bot token
5. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT

### Step 2: Invite the Bot to Your Server

1. In the Discord Developer Portal, go to the "OAuth2" > "URL Generator" tab
2. Select the "bot" scope
3. Select the following permissions:
   - Read Messages/View Channels
   - Send Messages
   - Embed Links
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### Step 3: Set Up the Project

1. Clone or download this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the `.env.example` file to `.env` and update with your:
   - Discord bot token
   - Discord channel ID (right-click on channel > Copy ID)
   - Desired check interval (in milliseconds)

### Step 4: Run the Bot

```
npm start
```

## Usage

The bot will automatically check for new job postings at the interval specified in your `.env` file.

### Commands

- `!jobfilter experience [LEVEL]` - Set the experience level filter (ENTRY_LEVEL, ASSOCIATE, MID_SENIOR, DIRECTOR, EXECUTIVE, NONE)
- `!jobcheck` - Manually check for new job postings
- `!jobhelp` - Show help message with available commands

## Important Notes

- LinkedIn may change their website structure, which could break the scraper. If this happens, the bot will need to be updated.
- To avoid potential blocking by LinkedIn, the bot uses a delay between requests and a user agent header.
- This bot is for educational purposes only. Be respectful of LinkedIn's terms of service and rate limits.

## Customization

You can modify the `config` object in the code to change:
- The job search query
- Additional filters
- Check interval
- Storage file location