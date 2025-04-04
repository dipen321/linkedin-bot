// Required packages
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const linkedIn = require('linkedin-jobs-api');

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
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 15 * 60 * 1000, // Default 15 minutes
  jobsDataFile: 'jobs.json',
  maxJobsPerCheck: parseInt(process.env.MAX_JOBS_PER_CHECK) || 5,
  searchParams: {
    keyword: process.env.SEARCH_TERM || 'software engineer',
    location: process.env.LOCATION || 'united states',
    dateSincePosted: process.env.DATE_POSTED || '24hr',
    experienceLevel: process.env.EXPERIENCE_LEVEL || 'entry level',
    jobType: process.env.JOB_TYPE || 'full time',
    remoteFilter: process.env.REMOTE_FILTER || '',
    sortBy: 'recent',
    limit: '10'
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

// Fetch LinkedIn jobs using the LinkedIn Jobs API
async function fetchLinkedInJobs() {
  try {
    console.log('Fetching LinkedIn jobs...');
    console.log('Query options:', config.searchParams);
    
    // Use the API as documented
    const response = await linkedIn.query(config.searchParams);
    
    console.log(`Found ${response.length} LinkedIn job listings`);
    
    // Process job items
    const jobListings = [];
    
    for (const item of response) {
      // Generate a unique ID
      const jobId = item.jobUrl.split('view/')[1]?.split('?')[0] || 
                   `linkedin-${item.position}-${item.company}`.replace(/\s+/g, '-').toLowerCase();
      
      if (!seenJobs.has(jobId)) {
        const job = {
          id: jobId,
          title: item.position || 'Software Engineering Position',
          company: item.company || 'Company on LinkedIn',
          location: item.location || 'Remote/Various',
          link: item.jobUrl,
          postedTime: item.agoTime || item.date || 'Recently',
          source: 'LinkedIn',
          description: `${item.salary ? 'Salary: ' + item.salary + ' • ' : ''}Posted: ${item.agoTime || item.date}`
        };
        
        jobListings.push(job);
        console.log(`Found LinkedIn job: ${job.title} at ${job.company} (${job.postedTime})`);
      }
    }
    
    return jobListings;
  } catch (error) {
    console.error('Error fetching LinkedIn jobs:', error.message);
    return [];
  }
}

// Send job notifications to Discord
async function sendJobNotifications(jobs, channel) {
  if (jobs.length === 0) {
    console.log("No new jobs to send notifications for.");
    return;
  }
  
  // Limit the number of jobs to send
  const jobsToSend = jobs.slice(0, config.maxJobsPerCheck);
  
  console.log(`Sending notifications for ${jobsToSend.length} new jobs...`);
  
  for (const job of jobsToSend) {
    // Create a rich embed for the job
    const embed = new EmbedBuilder()
      .setTitle(job.title)
      .setDescription(
        `**Company:** ${job.company}\n` +
        `**Location:** ${job.location || 'Not specified'}\n` +
        `**Posted:** ${job.postedTime || 'Recently'}\n` +
        `**Source:** ${job.source || 'LinkedIn'}\n` +
        (job.description ? `\n${job.description}` : '')
      )
      .setColor('#0077B5') // LinkedIn blue
      .setURL(job.link)
      .setFooter({ text: 'Job Alert • Today at ' + new Date().toLocaleTimeString() })
      .setTimestamp();
    
    try {
      console.log(`Sending notification for: ${job.title} at ${job.company}`);
      await channel.send({ embeds: [embed] });
      
      // Add job to seen jobs
      seenJobs.set(job.id, {
        id: job.id,
        title: job.title,
        company: job.company,
        dateFound: new Date().toISOString()
      });
      
      // Wait a short time to avoid Discord rate limiting
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
  
  try {
    const jobs = await fetchLinkedInJobs();
    
    if (jobs.length > 0) {
      await sendJobNotifications(jobs, channel);
    } else {
      console.log('No new LinkedIn job listings found.');
    }
  } catch (error) {
    console.error('Error checking for new jobs:', error);
  }
}

// Bot commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  if (command === '!jobfilter') {
    if (args.length < 1) {
      message.reply('Please specify filter. Available filters: keyword, location, experience, date, type, remote');
      return;
    }
    
    const filterType = args[0]?.toLowerCase();
    const filterValue = args.slice(1).join(' ');
    
    if (filterType === 'keyword') {
      if (!filterValue) {
        message.reply('Please specify a keyword (e.g., !jobfilter keyword software engineer)');
        return;
      }
      
      config.searchParams.keyword = filterValue;
      message.reply(`Keyword set to: ${filterValue}`);
    } 
    else if (filterType === 'location') {
      if (!filterValue) {
        message.reply('Please specify a location (e.g., !jobfilter location united states)');
        return;
      }
      
      config.searchParams.location = filterValue;
      message.reply(`Location set to: ${filterValue}`);
    }
    else if (filterType === 'experience') {
      const validLevels = ['internship', 'entry level', 'associate', 'senior', 'director', 'executive'];
      
      if (!filterValue || !validLevels.includes(filterValue.toLowerCase())) {
        message.reply('Please specify a valid experience level: internship, entry level, associate, senior, director, executive');
        return;
      }
      
      config.searchParams.experienceLevel = filterValue.toLowerCase();
      message.reply(`Experience level set to: ${filterValue}`);
    }
    else if (filterType === 'date') {
      const validDates = ['24hr', 'past week', 'past month'];
      
      if (!filterValue || !validDates.includes(filterValue.toLowerCase())) {
        message.reply('Please specify a valid date filter: 24hr, past week, past month');
        return;
      }
      
      config.searchParams.dateSincePosted = filterValue.toLowerCase();
      message.reply(`Date filter set to: ${filterValue}`);
    }
    else if (filterType === 'type') {
      const validTypes = ['full time', 'part time', 'contract', 'temporary', 'volunteer', 'internship'];
      
      if (!filterValue || !validTypes.includes(filterValue.toLowerCase())) {
        message.reply('Please specify a valid job type: full time, part time, contract, temporary, volunteer, internship');
        return;
      }
      
      config.searchParams.jobType = filterValue.toLowerCase();
      message.reply(`Job type set to: ${filterValue}`);
    }
    else if (filterType === 'remote') {
      const validRemote = ['on site', 'remote', 'hybrid'];
      
      if (!filterValue || !validRemote.includes(filterValue.toLowerCase())) {
        message.reply('Please specify a valid remote filter: on site, remote, hybrid');
        return;
      }
      
      config.searchParams.remoteFilter = filterValue.toLowerCase();
      message.reply(`Remote filter set to: ${filterValue}`);
    }
    else {
      message.reply('Available filters: keyword, location, experience, date, type, remote');
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
        { name: '!jobfilter keyword [TERM]', value: 'Set job keyword (e.g., !jobfilter keyword software engineer)' },
        { name: '!jobfilter location [PLACE]', value: 'Set location (e.g., !jobfilter location united states)' },
        { name: '!jobfilter experience [LEVEL]', value: 'Set experience level: internship, entry level, associate, senior, director, executive' },
        { name: '!jobfilter date [PERIOD]', value: 'Set date posted: 24hr, past week, past month' },
        { name: '!jobfilter type [TYPE]', value: 'Set job type: full time, part time, contract, temporary, volunteer, internship' },
        { name: '!jobfilter remote [OPTION]', value: 'Set remote filter: on site, remote, hybrid' },
        { name: '!jobcheck', value: 'Manually check for new job postings' },
        { name: '!jobhelp', value: 'Show this help message' },
        { name: '!jobclear', value: 'Clear job history (will show all jobs as new)' }
      )
      .setColor('#0077B5');
    
    message.channel.send({ embeds: [helpEmbed] });
  }
  
  else if (command === '!jobclear') {
    seenJobs.clear();
    saveSeenJobs();
    message.reply('Job history cleared. The next check will show all jobs as new.');
  }
});

// When bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Load previously seen jobs
  loadSeenJobs();
  
  // Set up periodic job checking
  setInterval(checkNewJobs, config.checkInterval);
  
  // Initial check with a delay
  setTimeout(checkNewJobs, 5000);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);