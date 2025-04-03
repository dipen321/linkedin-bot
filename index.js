// Required packages
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

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
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 30 * 60 * 1000, // Default 30 minutes
  jobsDataFile: 'jobs.json',
  searchTerm: process.env.SEARCH_TERM || 'software engineer',
  location: process.env.LOCATION || 'united states',
  maxJobsPerCheck: parseInt(process.env.MAX_JOBS_PER_CHECK) || 5
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

// Fetch jobs from Stack Overflow RSS feed
async function fetchStackOverflowJobs() {
  try {
    console.log('Fetching Stack Overflow jobs...');
    
    // Use Stack Overflow RSS feed for jobs
    const url = `https://stackoverflow.com/jobs/feed?q=${encodeURIComponent(config.searchTerm)}&l=${encodeURIComponent(config.location)}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 10000
    });
    
    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    
    const result = parser.parse(response.data);
    const items = result.rss?.channel?.item || [];
    
    // Process job items
    const jobListings = [];
    const itemsArray = Array.isArray(items) ? items : [items];
    
    for (const item of itemsArray) {
      if (!item) continue;
      
      const jobId = `stackoverflow-${item.guid}`;
      
      if (!seenJobs.has(jobId)) {
        const job = {
          id: jobId,
          title: item.title || 'Software Engineering Position',
          company: item.a10?.author?.name || 'Company on Stack Overflow',
          location: (item.location || 'Remote/Various').replace(/[<>]/g, ''),
          link: item.link,
          postedTime: item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Recently',
          source: 'Stack Overflow'
        };
        
        jobListings.push(job);
        console.log(`Found Stack Overflow job: ${job.title} at ${job.company}`);
      }
    }
    
    return jobListings;
  } catch (error) {
    console.error('Error fetching Stack Overflow jobs:', error.message);
    return [];
  }
}

// Fetch jobs from GitHub Jobs API
async function fetchGithubJobs() {
  try {
    console.log('Fetching GitHub jobs...');
    
    // Use GitHub Jobs API
    const url = `https://jobs.github.com/positions.json?description=${encodeURIComponent(config.searchTerm)}&location=${encodeURIComponent(config.location)}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    // Process job items
    const jobListings = [];
    
    for (const item of response.data) {
      const jobId = `github-${item.id}`;
      
      if (!seenJobs.has(jobId)) {
        const job = {
          id: jobId,
          title: item.title || 'Software Engineering Position',
          company: item.company || 'Company on GitHub Jobs',
          location: item.location || 'Remote/Various',
          link: item.url,
          postedTime: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recently',
          source: 'GitHub Jobs'
        };
        
        jobListings.push(job);
        console.log(`Found GitHub job: ${job.title} at ${job.company}`);
      }
    }
    
    return jobListings;
  } catch (error) {
    console.error('Error fetching GitHub jobs:', error.message);
    return [];
  }
}

// Fetch jobs from RSS feeds of tech company career pages
async function fetchCompanyRSSFeeds() {
  try {
    console.log('Fetching company career RSS feeds...');
    
    // List of company career RSS feeds
    const rssSources = [
      {
        url: 'https://careers.google.com/jobs/feeds/xml',
        name: 'Google Careers'
      },
      {
        url: 'https://jobs.lever.co/lever.rss',
        name: 'Lever Jobs'
      }
    ];
    
    const jobListings = [];
    
    for (const source of rssSources) {
      try {
        const response = await axios.get(source.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          timeout: 10000
        });
        
        // Parse XML
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_"
        });
        
        const result = parser.parse(response.data);
        const items = result.rss?.channel?.item || [];
        
        // Process job items
        const itemsArray = Array.isArray(items) ? items : [items];
        
        for (const item of itemsArray) {
          if (!item) continue;
          
          // Check if the job title contains our search term
          const titleLower = (item.title || '').toLowerCase();
          const descLower = (item.description || '').toLowerCase();
          
          if (titleLower.includes(config.searchTerm) || descLower.includes(config.searchTerm)) {
            const jobId = `${source.name.toLowerCase().replace(/\s+/g, '-')}-${item.guid || item.link}`;
            
            if (!seenJobs.has(jobId)) {
              const job = {
                id: jobId,
                title: item.title || 'Software Engineering Position',
                company: item['dc:creator'] || item.author || source.name,
                location: item.location || 'Remote/Various',
                link: item.link,
                postedTime: item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Recently',
                source: source.name
              };
              
              jobListings.push(job);
              console.log(`Found ${source.name} job: ${job.title}`);
            }
          }
        }
        
      } catch (error) {
        console.error(`Error fetching ${source.name} jobs:`, error.message);
      }
    }
    
    return jobListings;
  } catch (error) {
    console.error('Error fetching company RSS feeds:', error.message);
    return [];
  }
}

// Simulate finding jobs (for testing when real sources fail)
function simulatedJobs() {
  const companies = [
    'Amazon', 'Google', 'Microsoft', 'Apple', 'Facebook', 'Netflix', 
    'Uber', 'Lyft', 'Airbnb', 'Slack', 'Twitter', 'LinkedIn', 
    'Stripe', 'Square', 'Plaid', 'Robinhood', 'Coinbase', 'Dropbox'
  ];
  
  const locations = [
    'San Francisco, CA', 'Seattle, WA', 'New York, NY', 'Austin, TX', 
    'Boston, MA', 'Chicago, IL', 'Los Angeles, CA', 'Remote', 
    'Denver, CO', 'Portland, OR', 'Atlanta, GA', 'Dallas, TX'
  ];
  
  const jobTitles = [
    'Software Engineer', 'Senior Software Engineer', 'Full Stack Developer',
    'Backend Engineer', 'Frontend Engineer', 'DevOps Engineer', 
    'Mobile Developer', 'Data Scientist', 'Machine Learning Engineer',
    'SRE', 'Cloud Engineer', 'Security Engineer'
  ];
  
  const jobListings = [];
  
  // Generate a few random job listings
  for (let i = 0; i < 3; i++) {
    const company = companies[Math.floor(Math.random() * companies.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const title = jobTitles[Math.floor(Math.random() * jobTitles.length)];
    
    const jobId = `simulated-${company}-${title}`.replace(/\s+/g, '-').toLowerCase() + `-${Date.now()}`;
    
    if (!seenJobs.has(jobId)) {
      const job = {
        id: jobId,
        title: title,
        company: company,
        location: location,
        link: 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer',
        postedTime: 'Today',
        source: 'Simulated'
      };
      
      jobListings.push(job);
    }
  }
  
  return jobListings;
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
      .setDescription(`**Company:** ${job.company}\n**Location:** ${job.location || 'Not specified'}\n**Posted:** ${job.postedTime || 'Recently'}\n**Source:** ${job.source || 'Job Board'}`)
      .setColor('#0077B5') // Blue color
      .setURL(job.link || 'https://www.linkedin.com/jobs/')
      .setFooter({ text: 'Job Alert' })
      .setTimestamp();
    
    try {
      console.log(`Sending notification for: ${job.title} at ${job.company}`);
      await channel.send({ embeds: [embed] });
      
      // Add job to seen jobs
      seenJobs.set(job.id, {
        id: job.id,
        title: job.title,
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

// Check for new jobs from multiple sources
async function checkNewJobs() {
  const channel = client.channels.cache.get(config.channelId);
  if (!channel) {
    console.error(`Channel with ID ${config.channelId} not found!`);
    return;
  }
  
  let allJobs = [];
  
  // Try all sources
  try {
    // Try Stack Overflow Jobs
    const stackOverflowJobs = await fetchStackOverflowJobs();
    if (stackOverflowJobs.length > 0) {
      console.log(`Found ${stackOverflowJobs.length} jobs on Stack Overflow`);
      allJobs = allJobs.concat(stackOverflowJobs);
    }
    
    // Try GitHub Jobs
    const githubJobs = await fetchGithubJobs();
    if (githubJobs.length > 0) {
      console.log(`Found ${githubJobs.length} jobs on GitHub Jobs`);
      allJobs = allJobs.concat(githubJobs);
    }
    
    // Try company career RSS feeds
    const companyJobs = await fetchCompanyRSSFeeds();
    if (companyJobs.length > 0) {
      console.log(`Found ${companyJobs.length} jobs from company RSS feeds`);
      allJobs = allJobs.concat(companyJobs);
    }
    
    // If all sources fail, use simulated jobs for testing
    if (allJobs.length === 0) {
      console.log("No jobs found from external sources, using simulated jobs");
      const simJobs = simulatedJobs();
      allJobs = allJobs.concat(simJobs);
    }
    
    // Remove any duplicates based on title + company
    const uniqueJobs = Array.from(
      new Map(allJobs.map(job => [`${job.title}-${job.company}`, job])).values()
    );
    
    console.log(`Found ${uniqueJobs.length} unique new job listings in total`);
    
    if (uniqueJobs.length > 0) {
      await sendJobNotifications(uniqueJobs, channel);
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
      message.reply('Please specify filter. Available filters: search, location');
      return;
    }
    
    const filterType = args[0]?.toLowerCase();
    const filterValue = args.slice(1).join(' ');
    
    if (filterType === 'search') {
      if (!filterValue) {
        message.reply('Please specify a search term (e.g., !jobfilter search software engineer)');
        return;
      }
      
      config.searchTerm = filterValue;
      message.reply(`Search term set to: ${filterValue}`);
    } 
    else if (filterType === 'location') {
      if (!filterValue) {
        message.reply('Please specify a location (e.g., !jobfilter location united states)');
        return;
      }
      
      config.location = filterValue;
      message.reply(`Location set to: ${filterValue}`);
    }
    else {
      message.reply('Available filters: search, location');
    }
  }
  
  else if (command === '!jobcheck') {
    message.reply('Checking for new job postings...');
    await checkNewJobs();
  }
  
  else if (command === '!jobhelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('Job Monitor - Help')
      .setDescription('Commands:')
      .addFields(
        { name: '!jobfilter search [TERM]', value: 'Set search term (e.g., !jobfilter search software engineer)' },
        { name: '!jobfilter location [PLACE]', value: 'Set location (e.g., !jobfilter location united states)' },
        { name: '!jobcheck', value: 'Manually check for new job postings' },
        { name: '!jobhelp', value: 'Show this help message' },
        { name: '!jobclear', value: 'Clear job history (will show all jobs as new)' },
        { name: '!jobsources', value: 'List all job sources being monitored' }
      )
      .setColor('#0077B5');
    
    message.channel.send({ embeds: [helpEmbed] });
  }
  
  else if (command === '!jobclear') {
    seenJobs.clear();
    saveSeenJobs();
    message.reply('Job history cleared. The next check will show all jobs as new.');
  }
  
  else if (command === '!jobsources') {
    const sourcesEmbed = new EmbedBuilder()
      .setTitle('Job Monitor - Sources')
      .setDescription('Currently monitoring the following job sources:')
      .addFields(
        { name: 'Stack Overflow Jobs', value: 'RSS feed for developer jobs' },
        { name: 'GitHub Jobs', value: 'GitHub Jobs API' },
        { name: 'Company Career Pages', value: 'RSS feeds from tech company career pages' },
        { name: 'Simulated Jobs', value: 'Fallback source when other sources fail (for testing)' }
      )
      .setColor('#0077B5');
    
    message.channel.send({ embeds: [sourcesEmbed] });
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