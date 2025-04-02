// Required packages
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Configuration
const config = {
  channelId: process.env.CHANNEL_ID || '',
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 5 * 60 * 1000, // Default 5 minutes
  jobsDataFile: 'jobs.json',
  filters: {
    experienceLevel: '' // Default no filter, can be 'ENTRY_LEVEL', 'ASSOCIATE', 'MID_SENIOR', 'DIRECTOR', 'EXECUTIVE'
  }
};

// Storage for seen job posts to avoid duplicates
let seenJobs = new Map();

// Load previously seen jobs if available
function loadSeenJobs() {
  try {
    if (fs.existsSync(config.jobsDataFile)) {
      const jobsData = JSON.parse(fs.readFileSync(config.jobsDataFile, 'utf8'));
      seenJobs = new Map(Object.entries(jobsData));
      console.log(`Loaded ${seenJobs.size} previous job listings`);
    }
  } catch (error) {
    console.error('Error loading seen jobs:', error);
  }
}

// Save seen jobs to file
function saveSeenJobs() {
  try {
    // Convert Map to Object for JSON serialization
    const jobsObject = Object.fromEntries(seenJobs);
    fs.writeFileSync(config.jobsDataFile, JSON.stringify(jobsObject, null, 2));
  } catch (error) {
    console.error('Error saving seen jobs:', error);
  }
}

// LinkedIn scraper function
async function scrapeLinkedInJobs() {
  try {
    // Construct search URL with filters
    let url = 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=United%20States';
    
    // Add experience level filter if specified
    if (config.filters.experienceLevel) {
      url += `&f_E=${config.filters.experienceLevel}`;
    }
    
    // Add sort by date to get newest postings first
    url += '&sortBy=DD';
    
    console.log(`Scraping LinkedIn jobs: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const jobListings = [];
    
    // Extract job details
    $('.job-search-card').each((index, element) => {
      const jobId = $(element).attr('data-id');
      const title = $(element).find('.base-search-card__title').text().trim();
      const company = $(element).find('.base-search-card__subtitle').text().trim();
      const location = $(element).find('.job-search-card__location').text().trim();
      const link = $(element).find('.base-card__full-link').attr('href');
      const postedTime = $(element).find('.job-search-card__listdate').text().trim();
      
      if (jobId && title && company && !seenJobs.has(jobId)) {
        jobListings.push({
          id: jobId,
          title,
          company,
          location,
          link,
          postedTime
        });
      }
    });
    
    return jobListings;
  } catch (error) {
    console.error('Error scraping LinkedIn:', error);
    return [];
  }
}

// Send job notifications to Discord
async function sendJobNotifications(jobs, channel) {
  for (const job of jobs) {
    // Create a rich embed for the job
    const embed = new EmbedBuilder()
      .setTitle(job.title)
      .setDescription(`**Company:** ${job.company}\n**Location:** ${job.location}\n**Posted:** ${job.postedTime || 'Recently'}`)
      .setColor('#0077B5') // LinkedIn blue
      .setURL(job.link)
      .setFooter({ text: 'LinkedIn Job Alert' })
      .setTimestamp();
    
    try {
      await channel.send({ embeds: [embed] });
      
      // Add job to seen jobs
      seenJobs.set(job.id, {
        id: job.id,
        title: job.title,
        dateFound: new Date().toISOString()
      });
      
      // Wait a short time to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error sending job notification:', error);
    }
  }
  
  // Save updated seen jobs
  saveSeenJobs();
}

// Check for new jobs
async function checkNewJobs() {
  const channel = client.channels.cache.get(config.channelId);
  if (!channel) {
    console.error(`Channel with ID ${config.channelId} not found!`);
    return;
  }
  
  const jobs = await scrapeLinkedInJobs();
  console.log(`Found ${jobs.length} new job listings`);
  
  if (jobs.length > 0) {
    await sendJobNotifications(jobs, channel);
  }
}

// Bot commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  if (command === '!jobfilter') {
    const filterType = args[0]?.toLowerCase();
    const filterValue = args[1]?.toUpperCase();
    
    if (filterType === 'experience') {
      const validLevels = ['ENTRY_LEVEL', 'ASSOCIATE', 'MID_SENIOR', 'DIRECTOR', 'EXECUTIVE', 'NONE'];
      
      if (!filterValue || !validLevels.includes(filterValue)) {
        message.reply('Please specify a valid experience level: ENTRY_LEVEL, ASSOCIATE, MID_SENIOR, DIRECTOR, EXECUTIVE, or NONE');
        return;
      }
      
      config.filters.experienceLevel = filterValue === 'NONE' ? '' : filterValue;
      message.reply(`Experience level filter set to: ${filterValue === 'NONE' ? 'No filter' : filterValue}`);
    } else {
      message.reply('Available filters: experience (e.g., !jobfilter experience ENTRY_LEVEL)');
    }
  }
  
  else if (command === '!jobcheck') {
    message.reply('Checking for new job postings...');
    await checkNewJobs();
  }
  
  else if (command === '!jobhelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('LinkedIn Job Monitor - Help')
      .setDescription('Commands:')
      .addFields(
        { name: '!jobfilter experience [LEVEL]', value: 'Set experience level filter (ENTRY_LEVEL, ASSOCIATE, MID_SENIOR, DIRECTOR, EXECUTIVE, NONE)' },
        { name: '!jobcheck', value: 'Manually check for new job postings' },
        { name: '!jobhelp', value: 'Show this help message' }
      )
      .setColor('#0077B5');
    
    message.channel.send({ embeds: [helpEmbed] });
  }
});


client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Load previously seen jobs
  loadSeenJobs();
  
  
  setInterval(checkNewJobs, config.checkInterval);
  
  // Initial check
  setTimeout(checkNewJobs, 5000);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);