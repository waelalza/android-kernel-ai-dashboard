/**
 * AI Module - Handles communication with local LLM
 * Supports OpenAI-compatible APIs (Ollama, LM Studio, etc.)
 */

// System prompt for plan generation
const PLAN_SYSTEM_PROMPT = `You are an Android + Linux + kernel expert.
The user controls a rooted Android device over ADB.
Your job is to propose safe, step-by-step plans as JSON.

CRITICAL SAFETY RULES:
- You MUST NOT include any data-wiping or bootloader-destroying commands
- You MUST NOT include commands that write to /dev/block/* devices
- You MUST NOT include fastboot flash, dd to block devices, or format commands
- For dangerous operations like flashing kernels, only propose and label them with "dangerous": true
- Never assume dangerous commands are executed

Output ONLY valid JSON with this exact structure:
{
  "description": "Overall description of what this plan does",
  "steps": [
    {
      "title": "Short step title",
      "explanation": "Human-readable explanation of what this step does and why",
      "commands": ["shell command1", "shell command2"],
      "dangerous": false
    }
  ]
}

Mark any step as "dangerous": true if it involves:
- Flashing boot images, kernels, or partitions
- Writing to block devices
- Modifying bootloader settings
- Any irreversible system changes

Be specific and safe. Commands should be ADB shell commands (without the "adb -s device" prefix).`;

// System prompt for file editing
const FILE_EDIT_SYSTEM_PROMPT = `You are a Linux kernel and Android expert specializing in kernel configuration.
You will be given a kernel configuration file and an instruction to modify it.

Rules:
- Make ONLY the changes requested
- Add comments explaining WHY each change was made (use # for comments)
- Preserve the overall structure and formatting of the file
- If the instruction is unclear or could be harmful, add a warning comment instead
- For defconfig files, understand what each option does
- For Kconfig files, maintain proper syntax

Output ONLY the modified file content, nothing else. No explanations before or after.`;

/**
 * Make HTTP request to LLM API with timeout
 */
async function callLlm(baseUrl, model, messages, timeout = 60000) {
  const url = `${baseUrl}/chat/completions`;
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('LLM request timed out. Try a smaller model or check server performance.');
    }
    throw error;
  }
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJsonResponse(content) {
  // Try direct JSON parse first
  try {
    return JSON.parse(content);
  } catch (e) {
    // Ignore
  }
  
  // Try to extract JSON from markdown code blocks
  const patterns = [
    /```json\s*([\s\S]*?)\s*```/,
    /```\s*([\s\S]*?)\s*```/,
    /\{[\s\S]*\}/
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      try {
        const jsonStr = match[1] || match[0];
        return JSON.parse(jsonStr);
      } catch (e) {
        // Continue to next pattern
      }
    }
  }
  
  return null;
}

/**
 * Clean code response from markdown blocks
 */
function cleanCodeResponse(content) {
  content = content.replace(/^```\w*\n?/, '');
  content = content.replace(/\n?```$/, '');
  return content.trim();
}

/**
 * Generate execution plan from natural language goal
 */
async function generatePlan(baseUrl, model, deviceId, goal) {
  try {
    const userMessage = `Device ID: ${deviceId}
Goal: ${goal}

Generate a safe, step-by-step plan as JSON.`;

    const content = await callLlm(baseUrl, model, [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ]);
    
    const plan = parseJsonResponse(content);
    
    if (!plan) {
      return {
        plan: null,
        error: 'Failed to parse AI response as JSON'
      };
    }
    
    // Validate and enhance plan structure
    if (!plan.description) plan.description = 'AI-generated plan';
    if (!plan.steps) plan.steps = [];
    
    // Mark dangerous commands
    const dangerousPatterns = [
      /fastboot\s+flash/i,
      /\bdd\s+if=/i,
      /\bdd\s+of=/i,
      /\/dev\/block\//i,
      /format/i,
      /wipe/i
    ];
    
    for (const step of plan.steps) {
      if (!step.title) step.title = 'Unnamed step';
      if (!step.explanation) step.explanation = '';
      if (!step.commands) step.commands = [];
      
      // Check commands for dangerous patterns
      let hasDangerous = step.dangerous || false;
      for (const cmd of step.commands) {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(cmd)) {
            hasDangerous = true;
            break;
          }
        }
      }
      step.dangerous = hasDangerous;
    }
    
    return { plan, error: null };
    
  } catch (error) {
    if (error.message.includes('fetch')) {
      return {
        plan: null,
        error: `Cannot connect to LLM at ${baseUrl}. Is Ollama/LM Studio running?`
      };
    }
    return {
      plan: null,
      error: error.message
    };
  }
}

/**
 * Use AI to edit a file based on instruction
 */
async function editFile(baseUrl, model, content, instruction, filePath) {
  try {
    const fileContext = filePath ? `File: ${filePath}\n` : '';
    
    const userMessage = `${fileContext}
Current file content:
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}

Output the complete modified file:`;

    const newContent = await callLlm(baseUrl, model, [
      { role: 'system', content: FILE_EDIT_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ]);
    
    return {
      newContent: cleanCodeResponse(newContent),
      error: null
    };
    
  } catch (error) {
    if (error.message.includes('fetch')) {
      return {
        newContent: '',
        error: `Cannot connect to LLM at ${baseUrl}. Is Ollama/LM Studio running?`
      };
    }
    return {
      newContent: '',
      error: error.message
    };
  }
}

/**
 * Test connection to LLM
 */
async function testConnection(baseUrl, model) {
  try {
    const content = await callLlm(baseUrl, model, [
      { role: 'user', content: 'Say "OK" if you can hear me.' }
    ]);
    
    return {
      success: true,
      message: `Connected to LLM. Response: ${content.substring(0, 50)}`
    };
    
  } catch (error) {
    return {
      success: false,
      message: error.message.includes('fetch') 
        ? `Cannot connect to ${baseUrl}`
        : error.message
    };
  }
}

// Profile prompts for different performance modes
const PROFILE_PROMPTS = {
  battery: `You are an Android ADB expert. The user wants to apply a BATTERY SAVER profile.
Propose SAFE ADB shell commands to reduce power usage. Focus on:
- Reducing CPU max frequency (if possible without root: use settings commands)
- Disabling animations (window_animation_scale, transition_animation_scale, animator_duration_scale)
- Reducing screen brightness
- Other safe power-saving tweaks

Do NOT include any dangerous or destructive commands.

Output ONLY valid JSON:
{
  "description": "Brief description of what this profile does",
  "commands": ["shell command1", "shell command2", ...]
}

Commands should be ADB shell commands WITHOUT the "adb -s device" prefix.`,

  balanced: `You are an Android ADB expert. The user wants to RESTORE BALANCED/DEFAULT settings.
Propose SAFE ADB shell commands to restore default performance settings. Focus on:
- Restoring default animation scales (1.0)
- Restoring default system settings
- Clearing any performance tweaks

Do NOT include any dangerous or destructive commands.

Output ONLY valid JSON:
{
  "description": "Brief description of what this profile does",
  "commands": ["shell command1", "shell command2", ...]
}

Commands should be ADB shell commands WITHOUT the "adb -s device" prefix.`,

  gaming: `You are an Android ADB expert. The user wants to apply a GAMING/PERFORMANCE profile.
Propose SAFE ADB shell commands to maximize performance. Focus on:
- Disabling animations for faster response
- Keeping screen awake (stay_on_while_plugged_in)
- Other safe performance tweaks that don't require root

Do NOT include any dangerous or destructive commands.
Do NOT include commands that modify CPU governors or kernel settings directly.

Output ONLY valid JSON:
{
  "description": "Brief description of what this profile does",
  "commands": ["shell command1", "shell command2", ...]
}

Commands should be ADB shell commands WITHOUT the "adb -s device" prefix.`
};

/**
 * Generate commands for a performance profile
 */
async function generateProfilePlan(baseUrl, model, profileName) {
  try {
    const prompt = PROFILE_PROMPTS[profileName];
    
    if (!prompt) {
      return {
        description: '',
        commands: [],
        error: `Unknown profile: ${profileName}`
      };
    }
    
    const content = await callLlm(baseUrl, model, [
      { role: 'system', content: prompt },
      { role: 'user', content: `Generate the ${profileName} profile commands.` }
    ]);
    
    const result = parseJsonResponse(content);
    
    if (!result) {
      return {
        description: '',
        commands: [],
        error: 'Failed to parse AI response as JSON'
      };
    }
    
    return {
      description: result.description || `${profileName} profile`,
      commands: result.commands || [],
      error: null
    };
    
  } catch (error) {
    if (error.message.includes('fetch')) {
      return {
        description: '',
        commands: [],
        error: `Cannot connect to LLM at ${baseUrl}. Is Ollama/LM Studio running?`
      };
    }
    return {
      description: '',
      commands: [],
      error: error.message
    };
  }
}

module.exports = {
  generatePlan,
  editFile,
  testConnection,
  generateProfilePlan
};

