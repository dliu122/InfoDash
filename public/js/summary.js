// summary.js - Handles the summary section functionality

import { userPrefs } from './userPreferences.js';
import { updateSummaryWeather } from './weather.js';

let summaryData = {
    news: null,
    trends: null,
    finance: null,
    weather: null
};

let summaryGenerated = false;
let lastError = null;

// Function to get a YYYY-MM-DD string from a Date object in local time
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to check if user has already generated a summary today
function hasGeneratedToday() {
    const today = getLocalDateString();
    const lastGeneratedDate = localStorage.getItem('lastSummaryGeneratedDate');
    return lastGeneratedDate === today;
}

// Function to mark that a summary was generated today
function markGeneratedToday() {
    const today = getLocalDateString();
    localStorage.setItem('lastSummaryGeneratedDate', today);
}

// Function to get selected date or today's date
function getSelectedDate() {
    const dateInput = document.getElementById('summaryDate');
    return dateInput && dateInput.value ? dateInput.value : getLocalDateString();
}

// Function to collect data from all sections
async function collectSectionData() {
    console.log('collectSectionData: Starting to collect section data...');
    
    const data = {
        news: null,
        trends: null,
        finance: null
    };
    
    // Collect news data from API
    console.log('collectSectionData: Collecting news data from API...');
    data.news = await collectNewsDataFromAPI();
    console.log('collectSectionData: News data collected:', {
        hasData: !!data.news,
        count: data.news?.length || 0
    });
    
    // Collect trends data from API
    console.log('collectSectionData: Collecting trends data from API...');
    data.trends = await collectTrendsData();
    console.log('collectSectionData: Trends data collected:', {
        hasData: !!data.trends,
        count: data.trends?.length || 0
    });
    
    // Collect finance data from API
    console.log('collectSectionData: Collecting finance data from API...');
    data.finance = await collectFinanceData();
    console.log('collectSectionData: Finance data collected:', {
        hasData: !!data.finance,
        hasNasdaq: !!data.finance?.nasdaq,
        techStocksCount: Object.keys(data.finance?.techStocks || {}).length,
        cryptoCount: Object.keys(data.finance?.crypto || {}).length
    });
    
    console.log('collectSectionData: Section data collection completed:', {
        hasNews: !!data.news,
        hasTrends: !!data.trends,
        hasFinance: !!data.finance
    });
    
    return data;
}

// Function to collect news data from API
async function collectNewsDataFromAPI() {
    console.log('collectNewsDataFromAPI: Starting news data collection from API...');
    
    try {
        // Get current news settings
        const newsCountrySelect = document.getElementById('newsCountrySelect');
        const newsLanguageSelect = document.getElementById('newsLanguageSelect');
        
        if (!newsCountrySelect || !newsLanguageSelect) {
            console.log('News select elements not found, using defaults');
        }
        
        const country = newsCountrySelect?.value || 'US';
        const language = newsLanguageSelect?.value || 'en';
        
        console.log(`collectNewsDataFromAPI: Fetching news for country: ${country}, language: ${language}`);
        
        // Fetch news data from API
        const response = await fetch(`/api/news?country=${country}&language=${language}&category=general&pageSize=5`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('collectNewsDataFromAPI: Raw news data received');
        
        if (!data || !data.articles || data.articles.length === 0) {
            console.log('collectNewsDataFromAPI: No news data available');
            return null;
        }
        
        // Process the top 5 news articles
        const newsData = data.articles.slice(0, 5).map(article => ({
            title: article.title || 'Unknown',
            description: article.description || '',
            source: article.source?.name || article.author || ''
        }));
        
        console.log('collectNewsDataFromAPI: News data processed:', {
            totalItems: newsData.length,
            items: newsData.map(item => item.title.substring(0, 30))
        });
        
        return newsData.length > 0 ? newsData : null;
        
    } catch (error) {
        console.error('collectNewsDataFromAPI: Error collecting news data:', error);
        return null;
    }
}

// Function to collect trends data
async function collectTrendsData() {
    // console.log('Collecting trends data...');
    
    try {
        // Get the current country and language settings
        const trendsCountrySelect = document.getElementById('trendsCountrySelect');
        const trendsLanguageSelect = document.getElementById('trendsLanguageSelect');
        
        if (!trendsCountrySelect || !trendsLanguageSelect) {
            // console.log('Trends select elements not found');
            return null;
        }
        
        const country = trendsCountrySelect.value;
        const language = trendsLanguageSelect.value;
        
        // console.log(`Fetching trends for country: ${country}, language: ${language}`);
        
        // Fetch trends data directly from the API
        const response = await fetch(`/api/trends2?type=daily&category=all&language=${language}&geo=${country}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        // console.log('Raw trends data received');
        
        if (!data || !data.default || !data.default.trendingSearchesDays) {
            // console.log('No trends data available');
            return null;
        }
        
        // Extract all trends from the data
        let allTopics = [];
        const trendingSearchesDays = data.default.trendingSearchesDays || [];
        trendingSearchesDays.forEach(day => {
            if (day.trendingSearches) {
                allTopics = allTopics.concat(day.trendingSearches);
            }
        });
        
        // console.log(`Total trends found: ${allTopics.length}`);
        
        // Take the top 25 trends
        const top25Trends = allTopics.slice(0, 25).map(topic => ({
            title: topic.title?.query || topic.title || 'Unknown',
            traffic: topic.formattedTraffic || 'N/A'
        }));
        
        // console.log('Top 25 trends processed');
        // console.log('Top 25 trends processed:', top25Trends);
        return top25Trends.length > 0 ? top25Trends : null;
        
    } catch (error) {
        console.error('Error collecting trends data:', error);
        return null;
    }
}

// Function to collect finance data
async function collectFinanceData() {
    console.log('collectFinanceData: Starting finance data collection...');
    
    const financeData = {
        nasdaq: null,
        techStocks: {},
        crypto: {}
    };
    
    try {
        // First, check if the finance dashboard has already loaded data
        const dashboardContainer = document.getElementById('stock-dashboard');
        const dashboardGrid = dashboardContainer?.querySelector('.stock-dashboard-grid');
        const stockCards = dashboardGrid?.querySelectorAll('.stock-card');
        
        // console.log('collectFinanceData: Dashboard check:', {
        //     hasDashboard: !!dashboardContainer,
        //     hasGrid: !!dashboardGrid,
        //     stockCardsCount: stockCards?.length || 0
        // });
        
        // If dashboard has data, try to extract it first
        if (stockCards && stockCards.length > 0) {
            console.log('collectFinanceData: Using dashboard data');
            
            stockCards.forEach(card => {
                const symbol = card.getAttribute('data-symbol');
                if (!symbol) return;
                
                const priceElement = card.querySelector('.stock-price');
                const changeElement = card.querySelector('.stock-change');
                
                if (priceElement && changeElement) {
                    const priceText = priceElement.textContent.replace('$', '').replace(',', '');
                    const changeText = changeElement.textContent;
                    
                    // Extract percentage change
                    const changeMatch = changeText.match(/([+-]?\d+\.\d+)%/);
                    const changePercent = changeMatch ? parseFloat(changeMatch[1]) : 0;
                    
                    // Determine if it's crypto or stock
                    const isCrypto = symbol.endsWith('-USD');
                    
                    const stockData = {
                        price: parseFloat(priceText) || 0,
                        change: 0, // We don't have absolute change, only percentage
                        changePercent: changePercent,
                        timeframe: 'Current'
                    };
                    
                    if (symbol === '^IXIC') {
                        financeData.nasdaq = stockData;
                        //console.log('collectFinanceData: NASDAQ data from dashboard:', stockData);
                    } else if (isCrypto) {
                        financeData.crypto[symbol] = stockData;
                        //console.log(`collectFinanceData: ${symbol} data from dashboard:`, stockData);
                    } else {
                        financeData.techStocks[symbol] = stockData;
                        //console.log(`collectFinanceData: ${symbol} data from dashboard:`, stockData);
                    }
                }
            });
            
            // If we got good data from dashboard, return it
            const hasDashboardData = financeData.nasdaq || 
                                   Object.keys(financeData.techStocks).length > 0 || 
                                   Object.keys(financeData.crypto).length > 0;
            
            if (hasDashboardData) {
                // //console.log('collectFinanceData: Using dashboard data, skipping API calls');
                // console.log('collectFinanceData: Dashboard data summary:', {
                //     hasNasdaq: !!financeData.nasdaq,
                //     techStocksCount: Object.keys(financeData.techStocks).length,
                //     cryptoCount: Object.keys(financeData.crypto).length,
                //     techStocks: Object.keys(financeData.techStocks),
                //     crypto: Object.keys(financeData.crypto)
                // });
                return financeData;
            }
        }
        
        console.log('collectFinanceData: Dashboard data not available, making API calls...');
        
        // Fallback to API calls if dashboard data is not available
        // Fetch NASDAQ data
        console.log('collectFinanceData: Fetching NASDAQ data...');
        const nasdaqResponse = await fetch('/api/finance/^IXIC?range=1d&interval=1m');
        if (nasdaqResponse.ok) {
            const nasdaqData = await nasdaqResponse.json();
            //console.log('collectFinanceData: NASDAQ data received');
            if (nasdaqData.chart && nasdaqData.chart.result && nasdaqData.chart.result[0]) {
                const result = nasdaqData.chart.result[0];
                const meta = result.meta;
                //console.log('collectFinanceData: NASDAQ meta data processed');
                
                // Calculate current day's open-to-close (or latest) change
                const currentPrice = meta.regularMarketPrice;
                const openPrice = meta.regularMarketOpen;
                
                if (openPrice && currentPrice) {
                    const change = currentPrice - openPrice;
                    const changePercent = (change / openPrice) * 100;
                    
                    financeData.nasdaq = {
                        price: currentPrice?.toFixed(2) || 'N/A',
                        open: openPrice?.toFixed(2) || 'N/A',
                        change: change?.toFixed(2) || 'N/A',
                        changePercent: changePercent?.toFixed(2) || 'N/A',
                        timeframe: 'Today'
                    };
                } else {
                    // Fallback to previous close if open price not available
                    const previousClose = meta.previousClose;
                    const change = currentPrice - previousClose;
                    const changePercent = (change / previousClose) * 100;
                    
                    financeData.nasdaq = {
                        price: currentPrice?.toFixed(2) || 'N/A',
                        open: 'N/A',
                        change: change?.toFixed(2) || 'N/A',
                        changePercent: changePercent?.toFixed(2) || 'N/A',
                        timeframe: 'Since Previous Close'
                    };
                }
                //console.log('collectFinanceData: NASDAQ data collected:', financeData.nasdaq);
            } else {
                //console.log('collectFinanceData: NASDAQ data structure invalid');
            }
        } else {
            console.log('collectFinanceData: NASDAQ response not ok:', nasdaqResponse.status);
        }
        
        // Fetch tech stocks data
        const techStocks = ['META', 'AAPL', 'GOOGL', 'AMZN', 'TSLA'];
        console.log('collectFinanceData: Fetching tech stocks data...');
        for (const symbol of techStocks) {
            try {
                const response = await fetch(`/api/finance/${symbol}?range=1d&interval=1m`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.chart && data.chart.result && data.chart.result[0]) {
                        const result = data.chart.result[0];
                        const meta = result.meta;
                        
                        const currentPrice = meta.regularMarketPrice;
                        const openPrice = meta.regularMarketOpen;
                        
                        if (openPrice && currentPrice) {
                            const change = currentPrice - openPrice;
                            const changePercent = (change / openPrice) * 100;
                            
                            financeData.techStocks[symbol] = {
                                price: currentPrice?.toFixed(2) || 'N/A',
                                open: openPrice?.toFixed(2) || 'N/A',
                                change: change?.toFixed(2) || 'N/A',
                                changePercent: changePercent?.toFixed(2) || 'N/A',
                                timeframe: 'Today'
                            };
                        } else {
                            const previousClose = meta.previousClose;
                            const change = currentPrice - previousClose;
                            const changePercent = (change / previousClose) * 100;
                            
                            financeData.techStocks[symbol] = {
                                price: currentPrice?.toFixed(2) || 'N/A',
                                open: 'N/A',
                                change: change?.toFixed(2) || 'N/A',
                                changePercent: changePercent?.toFixed(2) || 'N/A',
                                timeframe: 'Since Previous Close'
                            };
                        }
                        //console.log(`collectFinanceData: ${symbol} data collected`);
                    }
                }
            } catch (error) {
                console.log(`collectFinanceData: Error fetching ${symbol} data:`, error);
            }
        }
        
        // Fetch crypto data
        const cryptoStocks = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD'];
        //console.log('collectFinanceData: Fetching crypto data...');
        for (const symbol of cryptoStocks) {
            try {
                const response = await fetch(`/api/finance/${symbol}?range=1d&interval=1m`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.chart && data.chart.result && data.chart.result[0]) {
                        const result = data.chart.result[0];
                        const meta = result.meta;
                        
                        const currentPrice = meta.regularMarketPrice;
                        const openPrice = meta.regularMarketOpen;
                        
                        if (openPrice && currentPrice) {
                            const change = currentPrice - openPrice;
                            const changePercent = (change / openPrice) * 100;
                            
                            financeData.crypto[symbol] = {
                                price: currentPrice?.toFixed(2) || 'N/A',
                                open: openPrice?.toFixed(2) || 'N/A',
                                change: change?.toFixed(2) || 'N/A',
                                changePercent: changePercent?.toFixed(2) || 'N/A',
                                timeframe: 'Today'
                            };
                        } else {
                            const previousClose = meta.previousClose;
                            const change = currentPrice - previousClose;
                            const changePercent = (change / previousClose) * 100;
                            
                            financeData.crypto[symbol] = {
                                price: currentPrice?.toFixed(2) || 'N/A',
                                open: 'N/A',
                                change: change?.toFixed(2) || 'N/A',
                                changePercent: changePercent?.toFixed(2) || 'N/A',
                                timeframe: 'Since Previous Close'
                            };
                        }
                        //console.log(`collectFinanceData: ${symbol} data collected`);
                    }
                }
            } catch (error) {
                console.log(`collectFinanceData: Error fetching ${symbol} data:`, error);
            }
        }
        
        // console.log('collectFinanceData: Finance data collection completed:', {
        //     hasNasdaq: !!financeData.nasdaq,
        //     techStocksCount: Object.keys(financeData.techStocks).length,
        //     cryptoCount: Object.keys(financeData.crypto).length,
        //     techStocks: Object.keys(financeData.techStocks),
        //     crypto: Object.keys(financeData.crypto)
        // });
        
        return financeData;
        
    } catch (error) {
        console.error('collectFinanceData: Error collecting finance data:', error);
        return null;
    }
}

// Function to generate summary using AI
async function generateSummary(sectionData) {
    // If summary is already done, don't show any warning or add event listener
    if (summaryGenerated) {
        return null;
    }

    let summaryDone = false;
    const beforeUnloadHandler = (event) => {
        if (!summaryDone) {
            event.preventDefault();
            // Chrome requires returnValue to be set
            event.returnValue = 'Your summary is still being generated. Are you sure you want to leave?';
            return event.returnValue;
        }
    };

    // Add the event listener when generation starts
    window.addEventListener('beforeunload', beforeUnloadHandler);

    // Function to clean up the event listener and mark summary as done
    const cleanupBeforeUnload = () => {
        summaryDone = true;
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    };

    // Show a notification to inform user about the warning
    showNotification('Please do not leave the page while your summary is being generated.', 5000);
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;

    try {
        while (retryCount < maxRetries && !summaryGenerated) {
            try {
                console.log('generateSummary: Starting AI generation...');
                console.log('Generating summary with data:', sectionData);

                const selectedModel = document.getElementById('model-select')?.value || 'z-ai/glm-4.5-air:free';

                // Prepare the data for AI analysis
                const analysisPrompt = createAnalysisPrompt(sectionData);

                console.log('generateSummary: Making API call to /api/chat...');
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [
                            {
                                role: 'system',
                                content: `You are a data analyst specializing in creating clear, concise summaries of current news, trends, and market data.
                                CRITICAL INSTRUCTIONS:
                                    - Only report the specific data provided. Do **not** infer, speculate, or add context from outside knowledge.
                                    - Except for the Info Genie section, you will act as a market predictor and future current events predictor.
                                    - For percentage changes:
                                    - If the change is positive, describe it as "up," "gaining," or "rose."
                                    - If the change is negative, describe it as "down," "declining," or "fell."
                                    - If the change is between -1% and +1%, refer to it as a "slight movement" or "minimal change."
                                    - Only use dramatic terms like "surged," "plunged," or "soared" for percentage changes greater than ±10%.
                                    - Do not interpret sentiment or market trends unless explicitly stated in the data.
                                    - For cryptocurrency, follow the same rules—do not infer excitement, volatility, or interest unless shown by large percentage changes.
                                    - Always refer to performance as part of "today's trading" or the "current session" (not longer timeframes) unless otherwise specified.
                                Ensure your tone remains professional, neutral, and fact-based at all times.`
                            },
                            {
                                role: 'user',
                                content: analysisPrompt
                            }
                        ],
                        model: selectedModel
                    }),
                });

                console.log('generateSummary: API response received, status:', response.status);
                console.log('API response status:', response.status);

                if (!response.ok) {
                    console.error('generateSummary: API response not ok:', response.status, response.statusText);

                    // Try to get more details about the error
                    let errorDetails = '';
                    try {
                        const errorResponse = await response.text();
                        errorDetails = errorResponse;
                        console.error('generateSummary: Error response body:', errorResponse);
                    } catch (e) {
                        console.error('generateSummary: Could not read error response body');
                    }

                    // If it's a 404 or 503 error, retry after a delay
                    if (response.status === 404 || response.status === 503) {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
                            console.log(`generateSummary: Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                    }

                    throw new Error(`HTTP error! status: ${response.status}${errorDetails ? ` - ${errorDetails}` : ''}`);
                }

                const data = await response.json();
                console.log('API response data:', data);

                const result = data.reply || 'Unable to generate summary at this time.';
                console.log('generateSummary: Returning result, length:', result.length);

                if (result && !result.includes('Error:') && !result.includes('Unable to generate')) {
                    await updateSummaryDisplay(result);  // CALL #1: Called when AI generation succeeds
                    await saveCurrentSummary();
                    await updateSavedSummariesList();
                    summaryGenerated = true;
                    cleanupBeforeUnload();
                    return result; // Return the result to the calling function
                } else {
                    await updateSummaryDisplay(result);  // CALL #2: Called when AI generation returns error
                    cleanupBeforeUnload();
                    return result; // Return the result even if it's an error
                }
            } catch (error) {
                lastError = error;
                console.error('generateSummary: Error in AI generation:', error);
                console.error('generateSummary: Error details:', {
                    message: error.message,
                    stack: error.stack
                });

                retryCount++;
                if (retryCount < maxRetries) {
                    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.log(`generateSummary: Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        if (!summaryGenerated) {
            const errorMessage = lastError?.message || 'Error: Unable to generate summary after multiple attempts.';
            await updateSummaryDisplay(errorMessage);  // CALL #3: Called when all retries fail
            cleanupBeforeUnload();
            return errorMessage;
        }
    } finally {
        // Always clean up if we exit the function for any reason
        if (!summaryDone) {
            cleanupBeforeUnload();
        }
    }
    return null; // Return null if no summary was generated
}

// Function to create analysis prompt
function createAnalysisPrompt(sectionData) {
    let prompt = 'Please analyze the following current data and provide a comprehensive summary:';
    const selectedDate = new Date(getSelectedDate() + 'T00:00:00'); // Use selected date to check for weekend
    const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;
    
    if (sectionData.news && sectionData.news.length > 0) {
        prompt += ' TOP HEADLINES:';
        sectionData.news.forEach((item, index) => {
            prompt += ` ${index + 1}. ${item.title}`;
            if (item.description) {
                prompt += ` ${item.description.substring(0, 100)}...`;
            }
        });
    }
    
    if (sectionData.trends && sectionData.trends.length > 0) {
        prompt += ' TRENDING TOPICS:';
        prompt += ' Group the top trending topics by category (such as Sports, Technology, Entertainment, or Other). Under each category, list the relevant trending topics. If you are unsure of a topic\'s category, place it under \'Other\'. Only use categories that are relevant for the current set of topics.';
        sectionData.trends.forEach((item, index) => {
            prompt += ` ${index + 1}. ${item.title} ${item.traffic ? `(${item.traffic})` : ''}`;
        });
    }
    
    if (sectionData.finance) {
        prompt += ' MARKET DATA:';
        if (isWeekend) {
            prompt += ' Stock markets are closed for the weekend. Here is the latest crypto data:';
        }

        if (sectionData.finance.nasdaq && !isWeekend) {
            const timeframe = sectionData.finance.nasdaq.timeframe || 'Today';
            prompt += ` NASDAQ (^IXIC): $${sectionData.finance.nasdaq.price} (${sectionData.finance.nasdaq.changePercent}% ${timeframe})`;
        }
        if (sectionData.finance.techStocks && !isWeekend) {
            Object.entries(sectionData.finance.techStocks).forEach(([symbol, data]) => {
                const timeframe = data.timeframe || 'Today';
                prompt += ` ${symbol}: $${data.price} (${data.changePercent}% ${timeframe})`;
            });
        }
        if (sectionData.finance.crypto) {
            Object.entries(sectionData.finance.crypto).forEach(([symbol, data]) => {
                const timeframe = data.timeframe || 'Today';
                prompt += ` ${symbol}: $${data.price} (${data.changePercent}% ${timeframe})`;
            });
        }
    }
    
    prompt += ' Please provide a structured summary with the following sections. Use the exact headers shown and format your response professionally with clear section breaks.';

    prompt += ' NEWS HIGHLIGHTS: Summarize the key news stories. Separate each  story in its own paragraph for readability. MAXIMUM 300 WORDS.';
    prompt += ' TRENDING TOPICS: Group the top trending topics by category (Sports, Technology, Entertainment, Other). For each category, list the topics. If a topic\'s category is unclear, place it under \'Other\'. MAXIMUM 300 WORDS.';

    if (isWeekend) {
        prompt += ' MARKET OVERVIEW: Provide insights on cryptocurrency performance. Note that traditional stock markets are closed. MAXIMUM 300 WORDS.';
        prompt += ' Info Genie: Pretend to be a fortune teller and try and predict the future. MAXIMUM 300 WORDS.';
    } else {
        prompt += ' MARKET OVERVIEW: Provide insights on today\'s trading session including tech stocks and crypto performance. MAXIMUM 300 WORDS.';
        prompt += ' Info Genie: Pretend to be a fortune teller and try and predict the future. MAXIMUM 300 WORDS.';
    }

    prompt += ' IMPORTANT: Format your response professionally with clear section headers (NEWS HIGHLIGHTS:, TRENDING TOPICS:, MARKET OVERVIEW:, INFO GENIE:). Use proper paragraph breaks between sections and within sections. Keep each section concise and focused. Do not exceed 300 words per section. Use a professional but accessible tone.';

    return prompt;
}

// Function to update summary display
async function updateSummaryDisplay(summaryText) {
    console.log('updateSummaryDisplay: Starting with summary text length:', summaryText?.length || 0);
    
    // Debug: Check if summary elements exist
    const newsSummary = document.querySelector('.news-summary .summary-text');
    const trendsSummary = document.querySelector('.trends-summary .summary-text');
    const financeSummary = document.querySelector('.finance-summary .summary-text');
    const overallSummary = document.querySelector('.overall-summary .summary-text');
    const summaryContentDiv = document.querySelector('.summary-content');
    
    console.log('updateSummaryDisplay: Summary elements found:', {
        newsSummary: !!newsSummary,
        trendsSummary: !!trendsSummary,
        financeSummary: !!financeSummary,
        overallSummary: !!overallSummary,
        summaryContentDiv: !!summaryContentDiv
    });
    
    // Force the summary content to be visible
    if (summaryContentDiv) {
        summaryContentDiv.style.display = 'block';
        summaryContentDiv.classList.add('show');
        console.log('updateSummaryDisplay: Forced summary content to be visible');
    }
    
    if (!summaryText || summaryText === 'Error: Unable to generate summary. Please try again later.') {
        console.log('updateSummaryDisplay: No valid summary text, showing error messages');
        // Update all summary text elements with error message
        if (newsSummary) newsSummary.innerHTML = '<p class="error-text">No summary exists for the selected date.</p>';
        if (trendsSummary) trendsSummary.innerHTML = '<p class="error-text">No summary exists for the selected date.</p>';
        if (financeSummary) financeSummary.innerHTML = '<p class="error-text">No summary exists for the selected date.</p>';
        if (overallSummary) overallSummary.innerHTML = '<p class="error-text">No summary exists for the selected date.</p>';
        return;
    }
    
    // Parse the summary text and extract sections
    const sections = parseSummarySections(summaryText);
    console.log('updateSummaryDisplay: Parsed sections:', {
        hasNews: !!sections.news,
        hasTrends: !!sections.trends,
        hasFinance: !!sections.finance,
        hasInsights: !!sections.insights,
        newsLength: sections.news?.length || 0,
        trendsLength: sections.trends?.length || 0,
        financeLength: sections.finance?.length || 0,
        insightsLength: sections.insights?.length || 0
    });
    
    // Update each section with specific selectors
    if (sections.news && newsSummary) {
        newsSummary.innerHTML = sections.news;
        console.log('updateSummaryDisplay: Updated news summary');
    } else {
        console.warn('updateSummaryDisplay: Could not update news summary - missing section or element');
    }
    
    if (sections.trends && trendsSummary) {
        trendsSummary.innerHTML = sections.trends;
        console.log('updateSummaryDisplay: Updated trends summary');
    } else {
        console.warn('updateSummaryDisplay: Could not update trends summary - missing section or element');
    }
    
    if (sections.finance && financeSummary) {
        financeSummary.innerHTML = sections.finance;
        console.log('updateSummaryDisplay: Updated finance summary');
    } else {
        console.warn('updateSummaryDisplay: Could not update finance summary - missing section or element');
    }
    
    if (sections.insights && overallSummary) {
        overallSummary.innerHTML = sections.insights;
        console.log('updateSummaryDisplay: Updated overall summary');
    } else {
        console.warn('updateSummaryDisplay: Could not update overall summary - missing section or element');
    }
    
    console.log('updateSummaryDisplay: Summary display update completed');
    
    // Fetch and display current weather separately (independent of summary generation)
    updateSummaryWeather();
}

// Function to parse summary sections
function parseSummarySections(summaryText) {
    const sections = {};
    
    console.log('parseSummarySections: Parsing text:', summaryText.substring(0, 200) + '...');
    
    // Extract news highlights - handle markdown format with ** and --- separators
    const newsMatch = summaryText.match(/(?:\*\*NEWS HIGHLIGHTS\*\*|NEWS HIGHLIGHTS:?)(.*?)(?=\*\*TRENDING TOPICS\*\*|TRENDING TOPICS:?|---)/s);
    if (newsMatch) {
        sections.news = newsMatch[1].trim();
        console.log('parseSummarySections: Found news section, length:', sections.news.length);
    } else {
        console.warn('parseSummarySections: No news section found');
    }
    
    // Extract trending topics - handle markdown format with ** and --- separators
    const trendsMatch = summaryText.match(/(?:\*\*TRENDING TOPICS\*\*|TRENDING TOPICS:?)(.*?)(?=\*\*MARKET OVERVIEW\*\*|MARKET OVERVIEW:?|---)/s);
    if (trendsMatch) {
        sections.trends = trendsMatch[1].trim();
        console.log('parseSummarySections: Found trends section, length:', sections.trends.length);
    } else {
        console.warn('parseSummarySections: No trends section found');
    }
    
    // Extract market overview - handle markdown format with ** and --- separators
    const financeMatch = summaryText.match(/(?:\*\*MARKET OVERVIEW\*\*|MARKET OVERVIEW:?)(.*?)(?=\*\*INFO GENIE\*\*|INFO GENIE:?|---)/s);
    if (financeMatch) {
        sections.finance = financeMatch[1].trim();
        console.log('parseSummarySections: Found finance section, length:', sections.finance.length);
    } else {
        console.warn('parseSummarySections: No finance section found');
    }
    
    // Extract INFO GENIE - handle markdown format with **
    const insightsMatch = summaryText.match(/(?:\*\*INFO GENIE\*\*|INFO GENIE:?)(.*?)$/s);
    if (insightsMatch) {
        sections.insights = insightsMatch[1].trim();
        console.log('parseSummarySections: Found insights section, length:', sections.insights.length);
    } else {
        console.warn('parseSummarySections: No insights section found');
    }
    
    console.log('parseSummarySections: Final sections:', {
        hasNews: !!sections.news,
        hasTrends: !!sections.trends,
        hasFinance: !!sections.finance,
        hasInsights: !!sections.insights
    });
    
    return sections;
}

// Function to show loading state
function showSummaryLoading() {
    const loadingDiv = document.querySelector('.summary-loading');
    const contentDiv = document.querySelector('.summary-content');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (contentDiv) contentDiv.style.display = 'none';
}

// Function to hide loading state
function hideSummaryLoading() {
    // console.log('Hiding summary loading...');
    
    const loadingDiv = document.querySelector('.summary-loading');
    const contentDiv = document.querySelector('.summary-content');
    
    // console.log('Loading div found:', !!loadingDiv);
    // console.log('Content div found:', !!contentDiv);
    
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
        // console.log('Loading div hidden');
    }
    
    if (contentDiv) {
        contentDiv.style.display = 'block';
        // console.log('Content div shown');
    }
    
    // Also ensure the summary section itself is visible
    // const summarySection = document.querySelector('#summary');
    // if (summarySection) {
    //     summarySection.style.display = 'block';
    //     // console.log('Summary section is visible');
    // }
}

// Function to update the loading text
function setSummaryLoadingText(text) {
    const loadingText = document.getElementById('summary-loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

// Function to show a non-blocking notification
function showNotification(message, duration = 3000) {
    const notificationBar = document.getElementById('notification-bar');
    if (notificationBar) {
        notificationBar.textContent = message;
        notificationBar.classList.add('show');
        setTimeout(() => {
            notificationBar.classList.remove('show');
        }, duration);
    }
}

// Function to enable/disable summary controls
async function setControlsDisabled(disabled) {
    const dateInput = document.getElementById('summaryDate');
    const refreshBtn = document.getElementById('summary-refresh-btn');
    
    if (dateInput) dateInput.disabled = disabled;
    if (refreshBtn) {
        await new Promise(resolve => setTimeout(resolve, 500));
        refreshBtn.disabled = disabled || hasGeneratedToday();
        // Add visual indication when refresh is disabled due to daily limit
        if (hasGeneratedToday()) {
            refreshBtn.title = 'You have already generated a summary today';
        } else {
            refreshBtn.title = 'Refresh current summary';
        }
    }
}

// Export functions for use in other modules
export { collectSectionData, generateSummary, initializeSummarySection }; 

// Daily Summary Management (Server-side)
let currentDailySummary = null;

// Function to save current summary to server
export async function saveCurrentSummary() {
    try {
        console.log('saveCurrentSummary: Starting save process...');
        const date = getSelectedDate();
        console.log('saveCurrentSummary: Date to save:', date);
        
        // Get current region settings
        const regionSelect = document.getElementById('summaryRegionSelect');
        let language = 'en';
        let country = 'US';
        
        if (regionSelect) {
            const selectedOption = regionSelect.options[regionSelect.selectedIndex];
            language = selectedOption.getAttribute('data-language');
            country = selectedOption.getAttribute('data-country');
        }
        
        console.log('saveCurrentSummary: Saving for region:', { language, country });
        
        // Get current summary content
        const newsSummary = document.querySelector('.news-summary .summary-text')?.innerHTML || '';
        const trendsSummary = document.querySelector('.trends-summary .summary-text')?.innerHTML || '';
        const financeSummary = document.querySelector('.finance-summary .summary-text')?.innerHTML || '';
        const overallSummary = document.querySelector('.overall-summary .summary-text')?.innerHTML || '';
        
        // console.log('saveCurrentSummary: Summary content lengths:', {
        //     news: newsSummary.length,
        //     trends: trendsSummary.length,
        //     finance: financeSummary.length,
        //     overall: overallSummary.length
        // });
        
        if (!newsSummary && !trendsSummary && !financeSummary && !overallSummary) {
            console.warn('saveCurrentSummary: No summary data available to save');
            alert('No summary data available to save. Please generate a summary first.');
            return;
        }
        
        const summaryData = {
            news: newsSummary,
            trends: trendsSummary,
            finance: financeSummary,
            overall: overallSummary,
            date: date,
            language: language,
            country: country
            // Weather is excluded from saved data - will be fetched fresh each time
        };
        
        //console.log('saveCurrentSummary: Sending data to server...');
        const response = await fetch('/api/summary/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(summaryData),
        });
        
        //console.log('saveCurrentSummary: Server response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('saveCurrentSummary: Save successful:', result);
            showNotification(`Summary saved successfully for ${country} (${language})!`, 3000);
            await updateSavedSummariesList(); // Refresh the archive list
        } else {
            const errorData = await response.json();
            console.error('saveCurrentSummary: Save failed:', errorData);
            showNotification(`Error saving summary: ${errorData.error || errorData.message}`, 5000);
        }
    } catch (error) {
        console.error('saveCurrentSummary: Error in save process:', error);
        showNotification('Error saving summary. Please try again.', 5000);
    }
}

// Function to load daily summary from server
async function loadDailySummary(date = null, language = 'en', country = 'US') {
    try {
        let url;
        if (date) {
            url = `/api/summary/daily?date=${date}&language=${language}&country=${country}`;
        } else {
            url = `/api/summary/daily?language=${language}&country=${country}`;
        }
        console.log('loadDailySummary: Fetching from URL:', url);
        const response = await fetch(url);
        console.log('loadDailySummary: Response status:', response.status);
        const result = await response.json();
        //console.log('loadDailySummary: Response result:', result);
        
        if (result.success) {
            console.log('loadDailySummary: Summary found and returned');
            return result.summary;
        } else {
            console.log('loadDailySummary: No daily summary found:', result.message);
            return null;
        }
    } catch (error) {
        console.error('loadDailySummary: Error loading daily summary:', error);
        return null;
    }
}

// Function to load summary history from server
async function loadSummaryHistory() {
    try {
        const response = await fetch('/api/summary/history');
        const result = await response.json();
        
        if (result.success) {
            return result.summaries;
        } else {
            console.error('Error loading summary history:', result.message);
            return [];
        }
    } catch (error) {
        console.error('Error loading summary history:', error);
        return [];
    }
}

// Function to update the saved summaries list in the UI
async function updateSavedSummariesList() {
    const container = document.getElementById('saved-summaries-list');
    if (!container) return;
    
    const summaries = await loadSummaryHistory();
    const list = container.querySelector('.collapsible-body') || container;
    
    // Extract dates for calendar
    const summaryDates = summaries.map(summary => summary.date).filter(date => date);
    
    // Initialize or update calendar
    if (!archiveCalendar) {
        archiveCalendar = new ArchiveCalendar('archiveCalendar', {
            summaryDates: summaryDates,
            selectedDate: getSelectedDate(),
            onDateSelect: function(dateString, hasSummary) {
                console.log('Calendar date selected:', dateString, 'Has summary:', hasSummary);
                
                if (!hasSummary) {
                    showNotification(`No summary available for ${new Date(dateString + 'T00:00:00').toLocaleDateString()}`, 3000);
                }
            }
        });
    } else {
        archiveCalendar.updateSummaryDates(summaryDates);
    }
    
    // Update list display (keep existing list functionality)
    list.innerHTML = '';
    
    if (summaries.length === 0) {
        list.innerHTML = '<p class="empty-state">No past summaries found.</p>';
        return;
    }

    summaries.forEach((summary, index) => {
        const item = document.createElement('div');
        item.className = 'saved-summary-item';
        item.dataset.date = summary.date;
        item.onclick = () => selectSummaryItem(summary.date);
        
        // Validate date format before parsing
        if (!summary.date || !/^\d{4}-\d{2}-\d{2}$/.test(summary.date)) {
            console.warn(`updateSavedSummariesListWithCalendar: Invalid date format: ${summary.date}`);
            return; // Skip this summary
        }
        
        const date = new Date(summary.date + 'T00:00:00'); // Treat date string as local, not UTC
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn(`updateSavedSummariesListWithCalendar: Invalid date: ${summary.date}`);
            return; // Skip this summary
        }
        
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        const time = new Date(summary.timestamp).toLocaleTimeString();
        const regionInfo = summary.language && summary.country ? ` (${summary.country}, ${summary.language})` : '';
        const automatedDiv = summary.automated ? 'Automated' : '';

        item.innerHTML = `
            <div>
                <div class="saved-summary-date">${formattedDate}</div>
                <div class="saved-summary-time">${time}${regionInfo}</div>
                <div class="saved-summary-automated">${automatedDiv}</div>
            </div>
        `;
        
        list.appendChild(item);
    });
}

// Function to select a summary item
async function selectSummaryItem(date) {
    // Remove previous selection from list
    document.querySelectorAll('.saved-summary-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    const selectedItem = document.querySelector(`[data-date="${date}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    // Update calendar selection
    if (archiveCalendar) {
        archiveCalendar.setSelectedDate(date);
        archiveCalendar.goToDate(date); // Navigate to the month containing this date
    }
    
    // Update date input and title date
    document.getElementById('summaryDate').value = date;
    document.getElementById('titleDate').textContent = `${date}`;
    
    // Get current region settings
    const regionSelect = document.getElementById('summaryRegionSelect');
    let language = 'en';
    let country = 'US';
    
    if (regionSelect) {
        const selectedOption = regionSelect.options[regionSelect.selectedIndex];
        language = selectedOption.getAttribute('data-language');
        country = selectedOption.getAttribute('data-country');
    }
    
    // Load and display the selected summary for the current region
    const summary = await loadDailySummary(date, language, country);
    if (summary) {
        displayHistoricalSummary(summary);
    } else {
        // If no summary found for current region, show notification
        showNotification(`No summary found for ${date} (${country}, ${language}). Try a different region.`, 3000);
    }
}

// Function to refresh the summary archive list
export async function refreshSummaryArchive() {
    console.log('refreshSummaryArchive: Refreshing summary archive list...');
    await updateSavedSummariesList();
    showNotification('Summary archive refreshed!', 2000);
}

// Function to load summary for a specific date and region from the datepicker and region selector
export async function loadSummaryForDate() {
    const dateInput = document.getElementById('summaryDate');
    const regionSelect = document.getElementById('summaryRegionSelect');
    const date = dateInput.value;
    const today = getLocalDateString();
    
    // Update the title text
    document.getElementById('titleDate').textContent = `${date}`;

    // Get selected region info
    let language = 'en';
    let country = 'US';
    
    if (regionSelect) {
        const selectedOption = regionSelect.options[regionSelect.selectedIndex];
        //language = selectedOption.getAttribute('data-language');
        //country = selectedOption.getAttribute('data-country');
    }
    const summary = await loadDailySummary(date, language, country);
    
    if (summary) {
        updateSummaryDisplayFromData(summary);
    } else {
        // No summary exists for this date and region. Clear the display.
        await updateSummaryDisplay(null);  // CALL #4: Called when no summary found for selected date
        showNotification(`No summary found for ${new Date(date + 'T00:00:00').toLocaleDateString()} (${country}, ${language}).`);
    }
    
    // The refresh button should only be active for the current day
    document.getElementById('summary-refresh-btn').style.display = (date === today) ? 'inline-block' : 'none';

    hideSummaryLoading();
    setControlsDisabled(false);
}

// Function to display historical summary (now combined with main display)
function displayHistoricalSummary(summary) {
    const newsSummary = document.querySelector('.news-summary .summary-text');
    const trendsSummary = document.querySelector('.trends-summary .summary-text');
    const financeSummary = document.querySelector('.finance-summary .summary-text');
    const overallSummary = document.querySelector('.overall-summary .summary-text');
    
    if (newsSummary) newsSummary.innerHTML = summary.news || '<p>No news data available</p>';
    if (trendsSummary) trendsSummary.innerHTML = summary.trends || '<p>No trends data available</p>';
    if (financeSummary) financeSummary.innerHTML = summary.finance || '<p>No finance data available</p>';
    if (overallSummary) overallSummary.innerHTML = summary.overall || '<p>No overall insights available</p>';
    
    // Fetch and display current weather (independent of historical summary)
    updateSummaryWeather();
}

// Function to delete selected summary (disabled for server-side summaries)
export async function deleteSelectedSummary() {
    alert('Daily summaries are shared across all users and cannot be deleted. Contact the administrator if you need to remove a summary.');
}

function updateSummaryDisplayFromData(summaryData) {
    const newsSummary = document.querySelector('.news-summary .summary-text');
    const trendsSummary = document.querySelector('.trends-summary .summary-text');
    const financeSummary = document.querySelector('.finance-summary .summary-text');
    const overallSummary = document.querySelector('.overall-summary .summary-text');

    if (newsSummary) {
        newsSummary.innerHTML = summaryData.news && summaryData.news.length > 3
            ? summaryData.news
            : '<p>No news data available</p>';
    }

    if (trendsSummary) {
        trendsSummary.innerHTML = summaryData.trends && summaryData.trends.length > 3
            ? summaryData.trends
            : '<p>No trends data available</p>';
    }

    if (financeSummary) {
        financeSummary.innerHTML = summaryData.finance && summaryData.finance.length > 3
            ? summaryData.finance
            : '<p>No finance data available</p>';
    }

    if (overallSummary) {
        overallSummary.innerHTML = summaryData.overall && summaryData.overall.length > 3
            ? summaryData.overall
            : '<p>No overall insights available</p>';
    }

    // ✅ Show summary content
    const summaryContentDiv = document.querySelector('.summary-content');
    if (summaryContentDiv) {
        summaryContentDiv.style.display = 'block';
        summaryContentDiv.classList.add('show');
    }

    // ✅ Hide loading and re-enable controls
    hideSummaryLoading();
    setControlsDisabled(false);

    // ✅ Update weather
    updateSummaryWeather();
}


// Helper: Get current time slot
function getCurrentTimeSlot(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 19) return 'afternoon';
    if (hour >= 19 && hour < 23) return 'evening';
    return 'night'; // 23:00-8:59
}

// Helper: Get time slot for a given timestamp string
function getTimeSlotForTimestamp(timestamp) {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return getCurrentTimeSlot(date);
}

// Function to check if user has already refreshed summary today (for manual refresh limit)
function hasRefreshedToday() {
    // Bypass refresh limit on localhost for development testing
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Development mode: Bypassing daily refresh limit on localhost');
        return false;
    }
    
    const today = getLocalDateString();
    const lastRefreshDate = localStorage.getItem('lastSummaryRefreshDate');
    return lastRefreshDate === today;
}

// Function to mark that a summary was refreshed today
function markRefreshedToday() {
    const today = getLocalDateString();
    localStorage.setItem('lastSummaryRefreshDate', today);
}


// This function will now orchestrate the entire summary section's initial state
async function loadOrGenerateTodaySummary() {
    // try to prevent refreshing while summary is loading or generating
    setControlsDisabled(true);

    const today = getLocalDateString();
    console.log('loadOrGenerateTodaySummary: Starting for date:', today);
    
    // Get current region settings
    const regionSelect = document.getElementById('summaryRegionSelect');
    let language = 'en';
    let country = 'US';
    
    // if (regionSelect) {
    //     const selectedOption = regionSelect.options[regionSelect.selectedIndex];
    //     language = selectedOption.getAttribute('data-language');
    //     country = selectedOption.getAttribute('data-country');
    // }
    
    // console.log('loadOrGenerateTodaySummary: Using region:', { language, country });
    

    setSummaryLoadingText(`Loading summary for ${new Date(today + 'T00:00:00').toLocaleDateString()} (${country}, ${language})...`);
    showSummaryLoading();

    const summary = await loadDailySummary(today, language, country);
    
    
    if (summary) {
        console.log('loadOrGenerateTodaySummary: Summary found:', !!summary);
        console.log('loadOrGenerateTodaySummary: Displaying existing summary');
        // Update the title text
        const titleDateElement = document.getElementById('titleDate');
        if (titleDateElement) {
            titleDateElement.textContent = `${today}`;
        }
        // A summary for today already exists, just display it
        updateSummaryDisplayFromData(summary);
    } else {
        console.log('loadOrGenerateTodaySummary: No summary found, user can generate new summary');
        setSummaryLoadingText(`No summary found for today. User can generate new summary by clicking refresh button.`);
        // update summary archive
        refreshSummaryArchive();
        hideSummaryLoading();

        // instruct user how to generate a summary by pressing refresh button
        const newsSummary = document.querySelector('.news-summary .summary-text');
        const trendsSummary = document.querySelector('.trends-summary .summary-text');
        const financeSummary = document.querySelector('.finance-summary .summary-text');
        const overallSummary = document.querySelector('.overall-summary .summary-text');
        
        const placeholderSummary= '<p>No summary date is currently selected. Click a date on the calendar widget or select a date on the summary archive to show a summary for that date. </p>';

        newsSummary.innerHTML = placeholderSummary;
        trendsSummary.innerHTML =  placeholderSummary;
        financeSummary.innerHTML =  placeholderSummary;
        overallSummary.innerHTML =  placeholderSummary;


        // alow refresh button to work
        setControlsDisabled(false);
    }
}

// Function to initialize the entire summary feature
async function initializeSummarySection() {
    console.log('Initializing summary section...');
    

    // Set up event listeners
    const dateInput = document.getElementById('summaryDate');
    if (dateInput) {
        dateInput.addEventListener('change', loadSummaryForDate);
        // Add event listener to update calendar when date input changes
        dateInput.addEventListener('change', function() {
            if (archiveCalendar) {
                archiveCalendar.setSelectedDate(this.value);
                archiveCalendar.goToDate(this.value);
            }
        });
        // Initialize the date picker with today's date
        const today = getLocalDateString();
        dateInput.value = today;
        
    }
    
    // Set up region dropdown for archive
    const regionSelect = document.getElementById('summaryRegionSelect');
    if (regionSelect) {
        regionSelect.addEventListener('change', loadSummaryForDate);
        // Set default to current user preferences
        const currentLanguage = userPrefs.getNewsLanguage() || 'en';
        const currentCountry = userPrefs.getTrendsCountry() || 'US';
        
        // Find and select the matching option
        const options = regionSelect.querySelectorAll('option');
        for (let option of options) {
            const optionLanguage = option.getAttribute('data-language');
            const optionCountry = option.getAttribute('data-country');
            
            if (optionLanguage === currentLanguage && optionCountry === currentCountry) {
                regionSelect.value = option.value;
                break;
            }
        }
    }
    
    await loadOrGenerateTodaySummary();
    
    // Update saved summaries list
    await updateSavedSummariesList();
    
    // Initialize weather display
    updateSummaryWeather();
    
    // Update refresh button status
    updateRefreshButtonStatus();
    
    console.log('Summary section initialized');
}

// Function to refresh summary (generates new one and saves to server)
export async function refreshSummary() {
    const today = getLocalDateString();
    // Only allow one manual refresh per user per day
    if (hasRefreshedToday()) {
        showNotification('You have already refreshed the summary today. Daily limit: 1 manual refresh per day.');
        return;
    }
    setSummaryLoadingText(`Generating a new summary for ${new Date(today + 'T00:00:00').toLocaleDateString()}...`);
    summaryGenerated = false;
    setControlsDisabled(true);
    showSummaryLoading();

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Summary generation timed out after 60 seconds')), 60000);
    });
    try {
        const summaryPromise = (async () => {
            const sectionData = await collectSectionData();
            const summaryText = await generateSummary(sectionData);
            if (summaryText && !summaryText.includes('Error:') && !summaryText.includes('Unable to generate')) {
                await updateSummaryDisplay(summaryText);  // CALL #9: Called when manual refresh succeeds
                await updateSavedSummariesList();
                markRefreshedToday();
                showNotification('Summary refreshed and saved successfully! Daily limit: 1 manual refresh per day.');
            } else {
                await updateSummaryDisplay(summaryText);  // CALL #10: Called when manual refresh returns error
                showNotification('Summary refreshed but could not be saved due to generation errors.');
            }
            setControlsDisabled(false);
        })();
        await Promise.race([summaryPromise, timeoutPromise]);
    } catch (error) {
        console.error('Error refreshing summary:', error);
        if (error.message.includes('timed out')) {
            updateSummaryDisplay('Error: Summary generation timed out after 5 minutes. Please try again.');  // CALL #11: Called when manual refresh times out
        } else {
            updateSummaryDisplay('Error: Unable to refresh summary. Please try again later.');  // CALL #12: Called when manual refresh fails with other error
        }
    } finally {
        hideSummaryLoading();
        setControlsDisabled(false);
        updateRefreshButtonStatus();
    }
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        if (section.style.display === 'none') {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    }
}

// Make functions available globally for HTML onclick handlers
window.saveCurrentSummary = saveCurrentSummary;
window.loadSummaryForDate = loadSummaryForDate;
window.deleteSelectedSummary = deleteSelectedSummary; 
window.refreshSummary = refreshSummary;
window.refreshSummaryArchive = refreshSummaryArchive;
window.toggleSection = toggleSection;

// Function to initialize location button
function initializeLocationButton() {
    // Location button functionality moved to modal and weather card header
    // No longer need to initialize a specific button
}

// Make functions globally available
window.initializeLocationButton = initializeLocationButton;
window.updateSummaryWeather = updateSummaryWeather;

// After setting weather location, update weather display in both sections
window.setWeatherLocation = function() {
    const input = document.getElementById('weatherLocationInput');
    const location = input.value.trim();
    if (!location) {
        alert('Please enter a location');
        return;
    }
    
    // Save location using userPrefs system
    userPrefs.setWeatherLocation(location);
    
    // Close modal
    const modal = document.getElementById('locationModal');
    const instance = M.Modal.getInstance(modal);
    if (instance) {
        instance.close();
    }
    
    // Show notification
    if (window.showNotification) {
        window.showNotification(`Weather location set to: ${location}`, 3000);
    } else {
        alert(`Weather location set to: ${location}`);
    }
    
    // Update weather in both summary and preferences
    updateSummaryWeather();
};

// Function to reset daily summary generation limit (for testing or admin use)
export function resetDailySummaryLimit() {
    localStorage.removeItem('lastSummaryGeneratedDate');
    // console.log('Daily summary generation limit reset');
    showNotification('Daily summary limit reset. You can now generate a new summary.');
    updateRefreshButtonStatus();
}

// Function to update refresh button status based on daily limit
function updateRefreshButtonStatus() {
    const refreshBtn = document.getElementById('summary-refresh-btn');
    if (!refreshBtn) return;
    if (hasRefreshedToday()) {
        refreshBtn.textContent = '🔄 Daily Limit Reached';
        refreshBtn.title = 'You have already refreshed the summary today. Daily limit: 1 manual refresh per day.';
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.6';
    } else {
        refreshBtn.textContent = '🔄 Generate a New Summary';
        refreshBtn.title = 'Generate a new summary (Daily limit: 1 manual refresh per day)';
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
    }
}

class ArchiveCalendar {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            onDateSelect: options.onDateSelect || function() {},
            summaryDates: options.summaryDates || [],
            selectedDate: options.selectedDate || null,
            ...options
        };
        
        this.currentDate = new Date();
        this.today = new Date();
        this.selectedDate = this.options.selectedDate ? new Date(this.options.selectedDate) : null;
        this.summaryDates = new Set(this.options.summaryDates);
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.render();
    }
    
    setupEventListeners() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousMonth());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextMonth());
        }
    }
    
    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
    }
    
    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
    }
    
    render() {
        this.renderHeader();
        this.renderCalendar();
    }
    
    renderHeader() {
        const monthYearElement = document.getElementById('monthYear');
        if (monthYearElement) {
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            const month = monthNames[this.currentDate.getMonth()];
            const year = this.currentDate.getFullYear();
            monthYearElement.textContent = `${month} ${year}`;
        }
    }
    
    renderCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) return;
        
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // Clear existing content
        calendarGrid.innerHTML = '';
        
        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'calendar-day-header';
            dayHeader.textContent = day;
            calendarGrid.appendChild(dayHeader);
        });
        
        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        
        // Generate calendar days
        const totalDays = 42; // 6 weeks * 7 days
        for (let i = 0; i < totalDays; i++) {
            const currentDay = new Date(startDate);
            currentDay.setDate(startDate.getDate() + i);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.textContent = currentDay.getDate();
            
            const dateString = this.formatDate(currentDay);
            
            // Add classes based on conditions
            if (currentDay.getMonth() !== month) {
                dayElement.classList.add('other-month');
            }
            
            if (this.isToday(currentDay)) {
                dayElement.classList.add('today');
            }
            
            if (this.isSelected(currentDay)) {
                dayElement.classList.add('selected');
            }
            
            if (this.hasSummary(dateString)) {
                dayElement.classList.add('has-summary');
            }
            
            // Add click event
            dayElement.addEventListener('click', () => {
                this.selectDate(currentDay);
            });
            
            calendarGrid.appendChild(dayElement);
        }
    }
    
    selectDate(date) {
        this.selectedDate = new Date(date);
        const dateString = this.formatDate(date);
        
        // Update the existing date input
        const dateInput = document.getElementById('summaryDate');
        if (dateInput) {
            dateInput.value = dateString;
        }
        
        // Re-render to update selected state
        this.render();
        
        // Call the existing function to load summary
        if (window.loadSummaryForDate) {
            window.loadSummaryForDate();
        }
        
        // Call callback
        if (this.options.onDateSelect) {
            this.options.onDateSelect(dateString, this.hasSummary(dateString));
        }
    }
    
    isToday(date) {
        return this.formatDate(date) === this.formatDate(this.today);
    }
    
    isSelected(date) {
        return this.selectedDate && this.formatDate(date) === this.formatDate(this.selectedDate);
    }
    
    hasSummary(dateString) {
        return this.summaryDates.has(dateString);
    }
    
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    updateSummaryDates(summaryDates) {
        this.summaryDates = new Set(summaryDates);
        this.render();
    }
    
    setSelectedDate(dateString) {
        this.selectedDate = dateString ? new Date(dateString + 'T00:00:00') : null;
        this.render();
    }
    
    goToDate(dateString) {
        const targetDate = new Date(dateString + 'T00:00:00');
        this.currentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        this.selectedDate = targetDate;
        this.render();
    }
}

let archiveCalendar = null;

// Make functions globally available
window.resetDailySummaryLimit = resetDailySummaryLimit;


// Initialize the summary section (this will load or generate today's summary)
initializeSummarySection();

// Helper function to get cookie value
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
    }
    return null;
} 


