import { checkInternetConnection } from './src/connection.js';
import { createDebouncedSuggester } from './src/index.js';

async function testBasicFunctionality() {
  console.log('Testing basic functionality...');
  
  // Check internet status
  const hasInternet = await checkInternetConnection();
  console.log('Internet connection:', hasInternet);
  
  // Test the suggester with allowWhenOnline to bypass the internet check
  const suggester = createDebouncedSuggester({
    delayMs: 100,
    allowWhenOnline: true, // Bypass internet check for testing
    onOnline: (message) => console.log('Online:', message)
  });
  
  console.log('Created suggester, attempting to get suggestion...');
  
  // Try to get a suggestion with a timeout
  const suggestionPromise = suggester.suggest('function hello(world) {');
  
  // Set a timeout for the suggestion
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Suggestion timeout')), 10000);
  });
  
  try {
    const suggestion = await Promise.race([suggestionPromise, timeoutPromise]);
    console.log('Suggestion result:', suggestion);
  } catch (error) {
    console.error('Error getting suggestion:', error.message);
  }
}

testBasicFunctionality().catch(console.error);