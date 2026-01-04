import { userPrefs } from './userPreferences.js';
import logger from './logger.js';

// Watchlist state
let watchlist = JSON.parse(localStorage.getItem('financeWatchlist') || '[]');
let stockSymbols = {};
let topStocks = [];
let stockDashboardInterval = null;
let previousStockData = {};
let isDashboardPaused = false;

// Default watchlist with popular stocks and cryptocurrencies
const DEFAULT_WATCHLIST = [
    'NVDA',    // NVIDIA - AI/GPU leader
    'AAPL',    // Apple - Tech giant
    'GOOGL',   // Google (Alphabet) - Tech/Advertising
    'META',    // Meta (Facebook) - Social media/AI
    'BTC-USD', // Bitcoin - Leading cryptocurrency
    'ETH-USD', // Ethereum - Smart contract platform
    '^IXIC',   // NASDAQ Composite - Tech index
    'NFLX',    // Netflix - Streaming entertainment
    'DJT',     // Trump Media & Technology Group
    'TSLA',    // Tesla - Electric vehicles/AI
    'MSFT',    // Microsoft - Software/AI
    'AMZN',    // Amazon - E-commerce/Cloud
    'SPY',     // S&P 500 ETF - Market benchmark
    '^DJI',    // Dow Jones Industrial Average
    '^GSPC',   // S&P 500 Index
    '^HSI',    // Hang Seng Index - Hong Kong
    '^N225',   // Nikkei 225 - Japan
    '^GDAXI',  // DAX - Germany
    '^FTSE',   // FTSE 100 - UK
    '^FCHI',   // CAC 40 - France
    '^STOXX50E', // EURO STOXX 50 - Europe
    'GC=F',    // Gold Futures
    'SI=F',    // Silver Futures
    'EURUSD=X', // Euro to US Dollar
    'USDJPY=X', // US Dollar to Japanese Yen
    'GBPUSD=X', // British Pound to US Dollar
    'USDCNY=X'  // US Dollar to Chinese Yuan
];

// Load stock symbols for autocomplete
async function loadStockSymbols() {
    try {
        const response = await fetch('/data/stockSymbols.json');
        stockSymbols = await response.json();
    } catch (error) {
        console.error('Error loading stock symbols:', error);
    }
}

// Initialize stock symbols on load
loadStockSymbols();

// Helper function to format price with commas and determine font size
function formatPriceWithCommas(price) {
    if (price === null || price === undefined || price === 'N/A') {
        return { formatted: 'N/A', fontSize: '1.2em' };
    }
    
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) {
        return { formatted: 'N/A', fontSize: '1.2em' };
    }
    
    // Format with commas
    const formatted = numPrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    // Determine font size based on number length
    let fontSize = '1.2em'; // Default size
    const priceStr = formatted.replace(/[^0-9]/g, ''); // Remove non-digits
    
    if (priceStr.length >= 7) { // 1,000,000+
        fontSize = '0.9em';
    } else if (priceStr.length >= 5) { // 10,000+
        fontSize = '1.0em';
    } else if (priceStr.length >= 3) { // 100+
        fontSize = '1.1em';
    }
    
    return { formatted, fontSize };
}

// Simplified stock symbol validation function
async function validateStockSymbol(symbol) {
    symbol = (symbol || '').trim().toUpperCase();
    if (!symbol) {
        return { valid: false, error: 'Symbol cannot be empty' };
    }
    // Most stock symbols are 1-5 alphanumerics, with some exceptions for indices/crypto
    if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
        return { valid: false, error: 'Invalid symbol format' };
    }

    const input = document.getElementById('stockSymbolInput');
    if (input) {
        input.style.borderColor = '#FFC107';
        input.title = `Validating ${symbol}...`;
    }

    try {
        const response = await fetch(`/api/finance/${symbol}?range=1d&interval=1m`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            let msg = 'Unknown error';
            if (response.status === 404) msg = 'Symbol not found';
            else if (response.status === 429) msg = 'Rate limit exceeded. Please try again later.';
            else if (response.status >= 500) msg = 'Server error. Please try again later.';
            else msg = `HTTP ${response.status}: ${response.statusText}`;
            return { valid: false, error: msg };
        }

        const data = await response.json();
        const result = data?.chart?.result?.[0];
        const meta = result?.meta;
        const closes = result?.indicators?.quote?.[0]?.close;

        if (!meta?.symbol || !Array.isArray(closes) || closes.every(v => v == null)) {
            return { valid: false, error: 'No valid price data available for this symbol' };
        }

        return {
            valid: true,
            name: meta.shortName || meta.longName || meta.symbol || symbol,
            symbol: meta.symbol,
            price: meta.regularMarketPrice,
            marketCap: meta.marketCap,
            volume: meta.volume
        };
    } catch (error) {
        console.error(`Error validating symbol ${symbol}:`, error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return { valid: false, error: 'Network error. Please check your connection.' };
        }
        return { valid: false, error: 'Validation failed. Please try again.' };
    } finally {
        if (input) {
            input.style.borderColor = '';
            input.title = 'Enter a stock symbol';
        }
    }
}

function isMarketOpen() {
    const symbolInput = document.getElementById('stockSymbolInput');
    const symbol = symbolInput ? symbolInput.value.toUpperCase() : '^IXIC';

    // Crypto check
    if (symbol.endsWith('-USD')) {
        return true;
    }

    // Eastern Time
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etNow.getDay();
    const hour = etNow.getHours();
    const minute = etNow.getMinutes();

    // Helper to check Good Friday
    function isGoodFriday(d) {
        const year = d.getFullYear();
        // Calculate Easter Sunday using "Computus"
        const f = Math.floor;
        const a = year % 19;
        const b = f(year / 100);
        const c = year % 100;
        const d1 = f(b / 4);
        const e = b % 4;
        const f1 = f((b + 8) / 25);
        const g = f((b - f1 + 1) / 3);
        const h = (19 * a + b - d1 - g + 15) % 30;
        const i = f(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = f((a + 11 * h + 22 * l) / 451);
        const month = f((h + l - 7 * m + 114) / 31) - 1; // 0-based
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        const easter = new Date(year, month, day);
        const goodFriday = new Date(easter);
        goodFriday.setDate(easter.getDate() - 2);
        return d.toDateString() === goodFriday.toDateString();
    }

    // Holiday checks
    const isHoliday = (() => {
        const d = etNow;
        const month = d.getMonth();
        const date = d.getDate();
        const dayOfWeek = d.getDay();

        // Fixed-date holidays + observed
        if ((month === 0 && date === 1) || // New Year’s
            (month === 5 && date === 19) || // Juneteenth
            (month === 6 && ((date === 4) || // July 4
                             (date === 3 && dayOfWeek === 5) || // observed Fri
                             (date === 5 && dayOfWeek === 1))) || // observed Mon
            (month === 11 && ((date === 25) || // Christmas
                              (date === 24 && dayOfWeek === 5) || // observed Fri
                              (date === 26 && dayOfWeek === 1)))) { // observed Mon
            return true;
        }

        // MLK Day (3rd Mon Jan)
        if (month === 0 && dayOfWeek === 1 && date >= 15 && date <= 21) return true;

        // Presidents Day (3rd Mon Feb)
        if (month === 1 && dayOfWeek === 1 && date >= 15 && date <= 21) return true;

        // Memorial Day (last Mon in May)
        if (month === 4 && dayOfWeek === 1 && date > 24) return true;

        // Labor Day (1st Mon Sep)
        if (month === 8 && dayOfWeek === 1 && date <= 7) return true;

        // Thanksgiving (4th Thu Nov)
        if (month === 10 && dayOfWeek === 4 && date >= 22 && date <= 28) return true;

        // Good Friday
        if (isGoodFriday(d)) return true;

        return false;
    })();

    // Check if weekday and not holiday
    if (day >= 1 && day <= 5 && !isHoliday) {
        // Market hours: 9:30 ≤ time < 16:00
        if ((hour > 9 || (hour === 9 && minute >= 30)) && hour < 16) {
            return true;
        }
    }
    return false;
}


// Fetch real-time data for a single stock
async function fetchRealTimeYahooFinanceData(symbol) {
    try {
        const response = await fetch(`/api/finance/${symbol}?range=5m&interval=1m`, {
            redirect: 'follow'
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Stock symbol ${symbol} not found (404)`);
                return { error: `Stock ${symbol} not found` };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
            console.warn(`Invalid data structure for ${symbol}`);
            return { error: `Invalid data for ${symbol}` };
        }
        
        const result = data.chart.result[0];
        const meta = result.meta;
        
        if (!meta) {
            console.warn(`No meta data for ${symbol}`);
            return { error: `No data available for ${symbol}` };
        }
        
        const currentPrice = meta.regularMarketPrice;
        const openPrice = meta.regularMarketOpen;
        const previousClose = meta.regularMarketPreviousClose || meta.chartPreviousClose;
        const timestamp = new Date(meta.regularMarketTime * 1000);
        
        // Calculate change and change percentage from open price (intraday change)
        let change = null;
        let changePercent = null;
        
        if (currentPrice !== null && openPrice !== null && openPrice !== 0) {
            // Use open price for intraday change calculation
            change = currentPrice - openPrice;
            changePercent = ((currentPrice - openPrice) / openPrice) * 100;
        } else if (currentPrice !== null && previousClose !== null && previousClose !== 0) {
            // Fallback to previous close if open price is not available
            change = currentPrice - previousClose;
            changePercent = ((currentPrice - previousClose) / previousClose) * 100;
        } else {
            // Use the API's values as last resort
            change = meta.regularMarketChange || 0;
            changePercent = meta.regularMarketChangePercent || 0;
        }

        return { 
            symbol, 
            price: currentPrice, 
            change: change !== null ? parseFloat(change.toFixed(2)) : 0, 
            changePercent: changePercent !== null ? parseFloat(changePercent.toFixed(2)) : 0, 
            timestamp,
            openPrice: openPrice,
            previousClose: previousClose
        };
    } catch (error) {
        console.error(`Error fetching real-time Yahoo Finance data for ${symbol}:`, error);
        return { error: `Unable to fetch data for ${symbol}` };
    }
}

async function fetchStockInfo(symbol) {
    try {
        const response = await fetch(`/api/finance/${symbol}?range=1d&interval=1m`);
        if (!response.ok) throw new Error('Failed to fetch stock info');
        
        const data = await response.json();
        const result = data.chart.result[0];
        const meta = result.meta;
        
        return {
            symbol: meta.symbol,
            name: meta.shortName || stockSymbols[symbol] || symbol,
            price: meta.regularMarketPrice,
            change: meta.regularMarketChange,
            changePercent: meta.regularMarketChangePercent,
            marketCap: meta.marketCap,
            volume: meta.volume,
            avgVolume: meta.averageVolume,
            high: meta.regularMarketDayHigh,
            low: meta.regularMarketDayLow,
            open: meta.regularMarketOpen,
            previousClose: meta.previousClose,
            marketState: meta.marketState
        };
    } catch (error) {
        console.error('Error fetching stock info:', error);
        return null;
    }
}

// Update stock dashboard display
function updateStockDashboard() {
    const dashboardContainer = document.getElementById('stock-dashboard');
    if (!dashboardContainer) {
        console.log('Stock dashboard container not found on this page, skipping update');
        return;
    }

    if (!topStocks || topStocks.length === 0) {
        dashboardContainer.innerHTML = `<div class="stock-dashboard-error"><p>No stocks in watchlist.</p></div>`;
        return;
    }

    // Check if this is the first time rendering the dashboard
    const existingGrid = dashboardContainer.querySelector('.stock-dashboard-grid');
    const isFirstRender = !existingGrid;

    if (isFirstRender) {
        // Initial render - create the full structure
        const marketStatus = isMarketOpen() ? 'OPEN' : 'CLOSED';
        const marketColor = isMarketOpen() ? '#4caf50' : '#f44336';

        let html = `
            <div class="market-status-indicator" style="text-align: center; margin-bottom: 15px; padding: 8px; background: ${marketColor}; color: white; border-radius: 6px; font-weight: bold;">
                Market: ${marketStatus}
            </div>
            <div class="stock-dashboard-grid">
        `;

        topStocks.forEach(stock => {
            if (!stock || stock.error) return;

            const change = stock.change || 0;
            const changePercent = stock.changePercent || 0;
            const changeColor = change >= 0 ? 'green' : 'red';
            const changeIcon = change >= 0 ? '↗' : '↘';

            // Format price with commas
            const priceFormat = formatPriceWithCommas(stock.price || 0);

            html += `
                <div class="stock-card" data-symbol="${stock.symbol}" onclick="selectStock('${stock.symbol}')">
                    <div class="stock-header">
                        <span class="stock-symbol">${stock.symbol}</span>
                        <span class="stock-name">${stockSymbols[stock.symbol] || stock.symbol}</span>
                    </div>
                    <div class="stock-price" style="color: ${changeColor}; font-size: ${priceFormat.fontSize};">$${priceFormat.formatted}</div>
                    <div class="stock-change">
                        ${changeIcon} <span style="color: ${changeColor};">${changePercent.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        dashboardContainer.innerHTML = html;
    } else {
        // Update existing cards in place
        const marketStatusIndicator = dashboardContainer.querySelector('.market-status-indicator');
        if (marketStatusIndicator) {
            const marketStatus = isMarketOpen() ? 'OPEN' : 'CLOSED';
            const marketColor = isMarketOpen() ? '#4caf50' : '#f44336';
            marketStatusIndicator.style.background = marketColor;
            marketStatusIndicator.textContent = `Market: ${marketStatus}`;
        }

        // Update each stock card individually
        topStocks.forEach(stock => {
            if (!stock || stock.error) return;

            const stockCard = dashboardContainer.querySelector(`[data-symbol="${stock.symbol}"]`);
            if (!stockCard) return;

            const previousData = previousStockData[stock.symbol];
            let animationClass = '';
            
            if (previousData && isMarketOpen()) {
                if (stock.price > previousData.price) {
                    animationClass = 'price-up';
                    stockCard.classList.remove('price-down');
                    stockCard.classList.add('price-up');
                } else if (stock.price < previousData.price) {
                    animationClass = 'price-down';
                    stockCard.classList.remove('price-up');
                    stockCard.classList.add('price-down');
                } else {
                    stockCard.classList.remove('price-up', 'price-down');
                }
            }

            const change = stock.change || 0;
            const changePercent = stock.changePercent || 0;
            const changeColor = change >= 0 ? 'green' : 'red';
            const changeIcon = change >= 0 ? '↗' : '↘';

            // Format price with commas
            const priceFormat = formatPriceWithCommas(stock.price || 0);

            // Update price
            const priceElement = stockCard.querySelector('.stock-price');
            if (priceElement) {
                priceElement.style.color = changeColor;
                priceElement.textContent = `$${priceFormat.formatted}`;
            }

            // Update change
            const changeElement = stockCard.querySelector('.stock-change');
            if (changeElement) {
                changeElement.innerHTML = `${changeIcon} <span style="color: ${changeColor};">${changePercent.toFixed(2)}%</span>`;
            }

            // Remove animation classes after animation completes
            if (animationClass) {
                setTimeout(() => {
                    stockCard.classList.remove('price-up', 'price-down');
                }, 1000);
            }
        });
    }

    // Store current data for next comparison
    topStocks.forEach(stock => {
        if (stock && !stock.error) {
            previousStockData[stock.symbol] = { ...stock };
        }
    });
}

// Function to add current symbol to watchlist
export async function addCurrentSymbolToWatchlist() {
    const input = document.getElementById('stockSymbolInput');
    if (!input) return;
    
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) {
        if (window.showNotification) {
            window.showNotification('Please enter a stock symbol first', 3000);
        }
        return;
    }
    
    // Check if already in watchlist
    const currentWatchlist = userPrefs.getFinanceWatchlist();
    if (currentWatchlist.includes(symbol)) {
        if (window.showNotification) {
            window.showNotification(`${symbol} is already in your watchlist`, 3000);
        }
        updateFinanceData(symbol, undefined, undefined, false);
        return;
    }
    
    // If not in stockSymbols, validate it first
    if (!stockSymbols[symbol]) {
        const validation = await validateStockSymbol(symbol);
        if (!validation.valid) {
            const errorMessage = validation.error || 'Unknown error occurred';
        if (window.showNotification) {
                window.showNotification(`Error: ${errorMessage}`, 5000);
            }
            return;
        }
        // Add to stockSymbols cache for future use
        stockSymbols[symbol] = validation.name;
    }
    
    // Add to watchlist
    addToWatchlist(symbol);
}

// Function to search and add stock from the search button
window.searchAndAddStock = async function() {
    try {
        const input = document.getElementById('stockSymbolInput');
        if (!input) {
            console.error('Stock symbol input element not found');
            return;
        }
        
        const symbol = input.value.trim().toUpperCase();
        if (!symbol) {
            if (window.showNotification) {
                window.showNotification('Please enter a stock symbol first', 3000);
            }
            return;
        }
        
        // Check if already in watchlist
        if (watchlist.includes(symbol)) {
            console.log(`${symbol} already in watchlist, updating data`);
            await updateFinanceData(symbol);
            await fetchStockInfo(symbol);
            if (window.showNotification) {
                window.showNotification(`${symbol} is already in your watchlist`, 3000);
            }
            return;
        }
        
        // Validate the symbol by attempting to fetch data
        const validation = await validateStockSymbol(symbol);
        if (!validation.valid) {
            const errorMessage = validation.error || 'Unknown error occurred';
            console.error(`Validation failed for ${symbol}:`, errorMessage);
            if (window.showNotification) {
                window.showNotification(`Error: ${errorMessage}`, 5000);
            } else {
                alert(`Error: ${errorMessage}`);
            }
            return;
        }

        // Add to stockSymbols cache for future use
        stockSymbols[symbol] = validation.name;
        console.log(`Added ${symbol} to stockSymbols cache`);
        
        // Add to watchlist
        await addToWatchlist(symbol);
        console.log(`Successfully added ${symbol} to watchlist`);
        
        // Show success notification with company name
        if (window.showNotification) {
            window.showNotification(`${symbol} (${validation.name}) added to watchlist!`, 3000);
        }
    } catch (error) {
        console.error('Error in searchAndAddStock:', error);
        if (window.showNotification) {
            window.showNotification(`Error adding stock: ${error.message}`, 5000);
        } else {
            alert(`Error adding stock: ${error.message}`);
        }
    }
}

// Function to reset to auto mode (allow automatic symbol switching)
export function resetToAutoMode() {
    userSelectedSymbol = false;
    userSelectedSymbol = false;
    logger.info('Reset to auto mode - allowing automatic symbol switching');
}

// Add to watchlist function
export function addToWatchlist(symbol) {
    if (!watchlist.includes(symbol)) {
        watchlist.push(symbol);
        userPrefs.setFinanceWatchlist(watchlist);
        updateWatchlistUI();

        // Fetch real-time data and add to dashboard
        fetchRealTimeYahooFinanceData(symbol).then(newStockData => {
            if (newStockData && !newStockData.error) {
                // Check if already in topStocks to avoid duplicates
                const existingIndex = topStocks.findIndex(stock => stock.symbol === symbol);
                if (existingIndex === -1) {
                    topStocks.push(newStockData);
                } else {
                    // Update existing data
                    topStocks[existingIndex] = newStockData;
                }
                    
                // Add the new stock card to the existing dashboard
                const dashboardContainer = document.getElementById('stock-dashboard');
                const grid = dashboardContainer?.querySelector('.stock-dashboard-grid');
                
                if (grid) {
                    // Check if card already exists
                    const existingCard = grid.querySelector(`[data-symbol="${symbol}"]`);
                    if (!existingCard) {
                        const change = newStockData.change || 0;
                        const changePercent = newStockData.changePercent || 0;
                        const changeColor = change >= 0 ? 'green' : 'red';
                        const changeIcon = change >= 0 ? '↗' : '↘';
                        
                        // Format price with commas
                        const priceFormat = formatPriceWithCommas(newStockData.price || 0);

                        const newCard = document.createElement('div');
                        newCard.className = 'stock-card';
                        newCard.setAttribute('data-symbol', symbol);
                        newCard.onclick = () => window.selectStock(symbol);
                        newCard.innerHTML = `
                            <div class="stock-header">
                                <span class="stock-symbol">${symbol}</span>
                                <span class="stock-name">${stockSymbols[symbol] || symbol}</span>
                            </div>
                            <div class="stock-price" style="color: ${changeColor}; font-size: ${priceFormat.fontSize};">$${priceFormat.formatted}</div>
                            <div class="stock-change">
                                ${changeIcon} <span style="color: ${changeColor};">${changePercent.toFixed(2)}%</span>
                            </div>
                        `;
                        
                        // Add with a fade-in effect
                        newCard.style.opacity = '0';
                        newCard.style.transform = 'scale(0.8)';
                        grid.appendChild(newCard);
                        
                        // Animate in
                        setTimeout(() => {
                            newCard.style.transition = 'all 0.3s ease';
                            newCard.style.opacity = '1';
                            newCard.style.transform = 'scale(1)';
                        }, 10);
                    }
                }
                
                // Update the finance chart to show the newly added stock
                if (window.updateFinanceData) {
                    window.updateFinanceData(symbol, undefined, undefined, false);
                }
                
                if (window.fetchStockInfo) {
                    window.fetchStockInfo(symbol);
                }
                
                // Show notification
                if (window.showNotification) {
                    window.showNotification(`${symbol} added to watchlist`, 3000);
                }
            } else {
                // Show error notification
                if (window.showNotification) {
                    window.showNotification(`Failed to fetch data for ${symbol}`, 4000);
                }
            }
        }).catch(error => {
            console.error(`Error adding ${symbol} to watchlist:`, error);
            if (window.showNotification) {
                window.showNotification(`Error adding ${symbol} to watchlist`, 4000);
            }
        });
    } else {
        // Already in watchlist
        if (window.showNotification) {
            window.showNotification(`${symbol} is already in your watchlist`, 3000);
        }
    }
}

// Remove from watchlist function
export function removeFromWatchlist(symbol) {
    // Remove from watchlist array
    watchlist = watchlist.filter(s => s !== symbol);
    userPrefs.setFinanceWatchlist(watchlist);
    updateWatchlistUI();

    // Remove from topStocks array
    topStocks = topStocks.filter(stock => stock.symbol !== symbol);
    
    // Remove the stock card from the dashboard with animation
    const dashboardContainer = document.getElementById('stock-dashboard');
    const stockCard = dashboardContainer?.querySelector(`[data-symbol="${symbol}"]`);
    
    if (stockCard) {
        stockCard.style.transition = 'all 0.3s ease';
        stockCard.style.opacity = '0';
        stockCard.style.transform = 'scale(0.8)';
        
        setTimeout(() => {
            if (stockCard.parentNode) {
                stockCard.parentNode.removeChild(stockCard);
            }
        }, 300);
    }

    // Also remove from previousStockData to prevent memory leaks
    if (previousStockData[symbol]) {
        delete previousStockData[symbol];
    }
    
    // Show notification
    if (window.showNotification) {
        window.showNotification(`${symbol} removed from watchlist`, 3000);
    }
}

// Update watchlist UI
export function updateWatchlistUI() {
    const watchlistContainer = document.getElementById('watchlist-container');
    if (!watchlistContainer) return;

    watchlistContainer.innerHTML = '';
    
    if (watchlist.length === 0) {
        watchlistContainer.innerHTML = '<p class="no-watchlist">No stocks in watchlist. Add some stocks to get started!</p>';
    } else {
        watchlist.forEach(symbol => {
            const watchlistItem = document.createElement('div');
            watchlistItem.className = 'watchlist-item';
            watchlistItem.innerHTML = `
                <span class="symbol">${symbol}</span>
                <span class="company-name">${stockSymbols[symbol] || symbol}</span>
                <button class="btn-small remove-watchlist" onclick="removeFromWatchlist('${symbol}')">×</button>
            `;
            
            // Add click event to the watchlist item (but not the remove button)
            watchlistItem.addEventListener('click', (e) => {
                // Don't trigger if clicking the remove button
                if (e.target.classList.contains('remove-watchlist')) {
                    return;
                }
                document.getElementById('stockSymbolInput').value = symbol;
                if (window.updateFinanceData) {
                    window.updateFinanceData(symbol);
                }
            });
            watchlistContainer.appendChild(watchlistItem);
        });
    }
    
    // Update preferences display if available
    if (window.updatePreferencesDisplay) {
        window.updatePreferencesDisplay();
    }
}

// Load watchlist from preferences
export function loadWatchlistFromPreferences() {
    const savedWatchlist = userPrefs.getFinanceWatchlist();
    if (savedWatchlist && savedWatchlist.length > 0) {
        watchlist = savedWatchlist;
    } else {
        // Use default watchlist for new users
        watchlist = [...DEFAULT_WATCHLIST];
        userPrefs.setFinanceWatchlist(watchlist);
    }
    updateWatchlistUI();
}

// Clear entire watchlist
export function clearWatchlist() {
    if (!window.confirm('Are you sure you want to clear your entire watchlist? This action cannot be undone.')) {
        return;
    }
    watchlist = [];
    userPrefs.setFinanceWatchlist(watchlist);
    updateWatchlistUI();
    
    // Refresh the stock dashboard to show empty state
    if (stockDashboardInterval) {
        fetchTopStocks();
        logger.success('Watchlist cleared and dashboard refreshed');
    } else {
        logger.success('Watchlist cleared');
    }
}

// Reset watchlist to default selection
export function resetToDefaultWatchlist() {
    if (!window.confirm('Are you sure you want to reset your entire watchlist? This action cannot be undone.')) {
        return;
    }
    watchlist = [...DEFAULT_WATCHLIST];
    userPrefs.setFinanceWatchlist(watchlist);
    updateWatchlistUI();
    
    // Refresh the stock dashboard to show the new symbols
    if (stockDashboardInterval) {
        fetchTopStocks();
        logger.success('Watchlist reset to default selection and dashboard refreshed');
    } else {
        logger.success('Watchlist reset to default selection');
    }
}

// Fetch top stocks for dashboard
export async function fetchTopStocks(symbolsOverride = null) {
    const symbolsToFetch = symbolsOverride || userPrefs.getFinanceWatchlist() || DEFAULT_WATCHLIST;
    if (symbolsToFetch.length === 0) {
        topStocks = [];
        updateStockDashboard();
        return;
    }

    try {
        const startTime = Date.now();
        const response = await fetch('/api/finance/bulk-real-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: symbolsToFetch }),
        });
        
        const responseTime = Date.now() - startTime;
        logger.logApiRequest('bulk-real-time', response.status, responseTime);
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Bulk endpoint error response:', errorText);
            throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        logger.logBulkStockUpdate(symbolsToFetch, data);

        let fetchedStocks = Object.values(data).filter(stock => !stock.error);

        // Use isMarketOpen() to determine if market is open
        let isMarketOpenFlag = false;
        if (typeof isMarketOpen === 'function') {
            try {
                isMarketOpenFlag = isMarketOpen();
            } catch (e) {
                logger.error("Error calling isMarketOpen():", e);
            }
        }

        // If market is closed, sort crypto to the top
        if (!isMarketOpenFlag) {
            fetchedStocks.sort((a, b) => {
                const aIsCrypto = a.symbol.endsWith('-USD');
                const bIsCrypto = b.symbol.endsWith('-USD');
                if (aIsCrypto && !bIsCrypto) return -1;
                if (!aIsCrypto && bIsCrypto) return 1;
                return 0;
            });
        }

        topStocks = fetchedStocks;
        updateStockDashboard();
        
        // Check for market close transition during dashboard updates
        if (window.handleMarketCloseTransition) {
            window.handleMarketCloseTransition();
        }
    } catch (error) {
        logger.error("Error fetching top stocks:", error);
    }
}

// Toggle stock dashboard pause/resume functionality
export function toggleStockDashboard() {
    const button = document.getElementById('dashboardToggle');
    
    if (isDashboardPaused) {
        // Resume the dashboard
        resumeStockDashboard();
        button.textContent = 'Pause';
        button.className = 'btn-small waves-effect waves-light green';
        isDashboardPaused = false;
    } else {
        // Pause the dashboard
        pauseStockDashboard();
        button.textContent = 'Resume';
        button.className = 'btn-small waves-effect waves-light red';
        isDashboardPaused = true;
    }
}

// Pause the stock dashboard
function pauseStockDashboard() {
    if (stockDashboardInterval) {
        clearInterval(stockDashboardInterval);
        stockDashboardInterval = null;
        logger.logDashboardStatus('paused');
    }
}

// Resume the stock dashboard
function resumeStockDashboard() {
    if (!stockDashboardInterval) {
        // Fetch current data immediately
        fetchTopStocks();
        // Start the interval again
        stockDashboardInterval = setInterval(fetchTopStocks, 5000);
        logger.logDashboardStatus('resumed');
    }
}

// Start stock dashboard auto-refresh (initial start)
export function startStockDashboard() {
    if (!stockDashboardInterval && !isDashboardPaused) {
        fetchTopStocks(); // Initial fetch
        stockDashboardInterval = setInterval(fetchTopStocks, 5000); // Refresh every 5 seconds
        logger.logDashboardStatus('started');
    }
}

// Stop stock dashboard (for cleanup)
export function stopStockDashboard() {
    if (stockDashboardInterval) {
        clearInterval(stockDashboardInterval);
        stockDashboardInterval = null;
        logger.logDashboardStatus('stopped');
    }
}

// Enhanced autocomplete functionality
export function setupAutocomplete() {
    const input = document.getElementById('stockSymbolInput');
    const autocompleteList = document.getElementById('autocomplete-list');
    if (!input || !autocompleteList) return;

    function renderSuggestions() {
        const value = input.value.toUpperCase();
        autocompleteList.innerHTML = '';
        
        if (value.length < 1) {
            autocompleteList.style.display = 'none';
            return;
        }
        
        // Always show the autocomplete list when there's input
        autocompleteList.style.display = 'block';
        
        // Show matches from stockSymbols.json
        const matches = Object.entries(stockSymbols)
            .filter(([symbol, name]) => symbol.includes(value) || name.toUpperCase().includes(value))
            .slice(0, 10);
        let symbolInMatches = false;
        
        if (matches.length > 0) {
            matches.forEach(([symbol, name]) => {
                if (symbol === value.trim()) symbolInMatches = true;
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <span class="symbol">${symbol}</span>
                    <span class="name">${name}</span>
                    <button class="btn-small add-watchlist" onclick="addToWatchlist('${symbol}')">+</button>
                `;
                item.addEventListener('click', (e) => {
                    // Don't trigger if clicking the add button
                    if (e.target.classList.contains('add-watchlist')) {
                        return;
                    }
                    userSelectedSymbol = true; // User manually selected this symbol
                    input.value = symbol;
                    autocompleteList.style.display = 'none';
                    updateFinanceData(symbol);
                    fetchStockInfo(symbol);
                });
                autocompleteList.appendChild(item);
            });
        }
        
        // Always show add button for the current input if it's not already in the watchlist
        const symbol = value.trim();
        if (symbol && symbol.length > 0 && !watchlist.includes(symbol)) {
            const addBtn = document.createElement('div');
            addBtn.className = 'autocomplete-item';
            const displayName = stockSymbols[symbol] || symbol;
            addBtn.innerHTML = `<span class="symbol">${symbol}</span><span class="name">${displayName}</span><button class="btn-small add-watchlist" onclick="addToWatchlist('${symbol}')">Add to Watchlist</button>`;
            addBtn.addEventListener('click', async (e) => {
                // Don't trigger if clicking the add button
                if (e.target.classList.contains('add-watchlist')) {
                    return;
                }
                
                // Validate unknown symbols before adding
                if (!stockSymbols[symbol]) {
                    const validation = await validateStockSymbol(symbol);
                    if (!validation.valid) {
                        const errorMessage = validation.error || 'Unknown error occurred';
                        if (window.showNotification) {
                            window.showNotification(`Error: ${errorMessage}`, 5000);
                        }
                        return;
                    }
                    // Add to stockSymbols cache for future use
                    stockSymbols[symbol] = validation.name;
                }
                
                addToWatchlist(symbol);
                autocompleteList.style.display = 'none';
            });
            autocompleteList.appendChild(addBtn);
        }
    }

    input.addEventListener('input', renderSuggestions);
    input.addEventListener('focus', renderSuggestions);

    // Pressing Enter with any symbol - validate and add to watchlist
    input.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter') {
            const symbol = this.value.trim().toUpperCase();
            if (symbol && symbol.length > 0) {
                userSelectedSymbol = true; // User manually entered this symbol
                
                // First check if it's already in watchlist
                if (watchlist.includes(symbol)) {
                    updateFinanceData(symbol);
                    fetchStockInfo(symbol);
                    autocompleteList.style.display = 'none';
                    return;
                }
                
                // Validate the symbol by attempting to fetch data
                const validation = await validateStockSymbol(symbol);
                if (validation.valid) {
                    // Add to stockSymbols cache for future use
                    stockSymbols[symbol] = validation.name;
                    
                    // Add to watchlist
                    addToWatchlist(symbol);
                    autocompleteList.style.display = 'none';
                    
                    // Show success notification with company name
                    if (window.showNotification) {
                        window.showNotification(`${symbol} (${validation.name}) added to watchlist!`, 3000);
                }
            } else {
                    // Show specific error message
                    const errorMessage = validation.error || 'Unknown error occurred';
                if (window.showNotification) {
                        window.showNotification(`Error: ${errorMessage}`, 5000);
                } else {
                        alert(`Error: ${errorMessage}`);
                    }
                }
            }
        }
    });

    // Add a visual indicator for symbols
    input.addEventListener('input', function() {
        const symbol = this.value.trim().toUpperCase();
        if (symbol && symbol.length > 0) {
            if (stockSymbols[symbol]) {
                // Known symbol from our list
            this.style.borderColor = '#4CAF50';
                this.title = `Known symbol: ${symbol} - ${stockSymbols[symbol]}`;
            } else if (watchlist.includes(symbol)) {
                // Symbol already in watchlist
                this.style.borderColor = '#2196F3';
                this.title = `Already in watchlist: ${symbol}`;
            } else {
                // Unknown symbol - will be validated when added
                this.style.borderColor = '#FF9800';
                this.title = `Unknown symbol: ${symbol} - Will validate when added`;
            }
        } else {
            this.style.borderColor = '';
            this.title = 'Enter a stock symbol';
        }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !autocompleteList.contains(e.target)) {
            autocompleteList.style.display = 'none';
        }
    });
}

// Getters for external access
export function getWatchlist() {
    return [...watchlist];
}

export function getStockSymbols() {
    return stockSymbols;
}

export function getTopStocks() {
    return [...topStocks];
}

// Make functions available globally for HTML onclick handlers
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.clearWatchlist = clearWatchlist;
window.resetToDefaultWatchlist = resetToDefaultWatchlist;
window.toggleStockDashboard = toggleStockDashboard;
window.startStockDashboard = startStockDashboard;
window.stopStockDashboard = stopStockDashboard;
window.fetchTopStocks = fetchTopStocks;
window.loadWatchlistFromPreferences = loadWatchlistFromPreferences;
window.updateWatchlistUI = updateWatchlistUI;
window.addCurrentSymbolToWatchlist = addCurrentSymbolToWatchlist;
window.resetToAutoMode = resetToAutoMode;
window.validateStockSymbol = validateStockSymbol;


