// Run this in the browser console to find the exact syntax error location

async function findSyntaxError() {
    try {
        // Try to fetch and parse the app.js file
        const response = await fetch('/app.js');
        const code = await response.text();
        
        console.log('App.js file size:', code.length, 'bytes');
        
        // Try to create a function with the code to trigger the syntax error
        try {
            new Function(code);
            console.log('No syntax error found when parsing!');
        } catch (e) {
            console.error('Syntax error found:', e.message);
            
            // Try to extract line number from error
            const match = e.message.match(/line (\d+)/);
            if (match) {
                const lineNum = parseInt(match[1]);
                console.log('Error appears to be around line:', lineNum);
                
                // Show context
                const lines = code.split('\n');
                console.log('\nContext around error:');
                for (let i = Math.max(0, lineNum - 10); i < Math.min(lines.length, lineNum + 10); i++) {
                    const marker = i === lineNum - 1 ? '>>> ' : '    ';
                    console.log(marker + (i + 1) + ': ' + lines[i]);
                }
            }
        }
        
        // Also check for specific patterns that might cause issues
        console.log('\nChecking for common issues...');
        
        // Check for try without catch
        const tryMatches = code.matchAll(/try\s*{/g);
        let tryCount = 0;
        for (const match of tryMatches) {
            tryCount++;
            const pos = match.index;
            const before = code.substring(pos - 50, pos);
            const after = code.substring(pos, pos + 200);
            
            // Look for catch or finally
            if (!after.match(/}\s*catch/) && !after.match(/}\s*finally/)) {
                const lineNum = code.substring(0, pos).split('\n').length;
                console.warn('Potential issue: try without catch/finally at line', lineNum);
            }
        }
        console.log('Total try blocks found:', tryCount);
        
    } catch (error) {
        console.error('Failed to analyze:', error);
    }
}

// Run the analysis
findSyntaxError();