import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export interface ThemeCreationResult {
  success: boolean
  output?: string
  error?: string
}

export async function createThemeFolder(userId: string, sandboxId: string): Promise<ThemeCreationResult> {
  try {
    const scriptPath = path.join(process.cwd(), 'build.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId}`, {
      timeout: 5000, // 5 seconds timeout for folder creation
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Build script stderr:', stderr)
    }

    console.log('Build script output:', stdout)

    return {
      success: true,
      output: stdout
    }
  } catch (error: unknown) {
    console.error('Error executing build script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function pullTheme(userId: string, sandboxId: string, storeUrl: string, apiKey: string): Promise<ThemeCreationResult> {
  try {
    const scriptPath = path.join(process.cwd(), 'pull-theme.sh')
    const { stdout, stderr } = await execAsync(`${scriptPath} ${userId} ${sandboxId} ${storeUrl} ${apiKey}`, {
      timeout: 120000, // 2 minutes timeout for shopify theme pull
      cwd: process.cwd() // Ensure script runs from project root
    })

    if (stderr) {
      console.error('Pull theme script stderr:', stderr)
    }

    console.log('Pull theme script output:', stdout)

    return {
      success: true,
      output: stdout
    }
  } catch (error: unknown) {
    console.error('Error executing pull theme script:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

// Future VM implementation would replace these functions:
// export async function createThemeFolderOnVM(userId: string, sandboxId: string): Promise<ThemeCreationResult> {
//   try {
//     const result = await vmClient.executeScript({
//       script: 'build.sh',
//       params: { userId, sandboxId },
//       vmInstance: 'theme-builder-vm',
//       timeout: 30000
//     })
//
//     return {
//       success: true,
//       output: result.stdout
//     }
//   } catch (error) {
//     return {
//       success: false,
//       error: error.message
//     }
//   }
// }
//
// export async function pullThemeOnVM(userId: string, sandboxId: string, storeUrl: string, apiKey: string): Promise<ThemeCreationResult> {
//   try {
//     const result = await vmClient.executeScript({
//       script: 'pull-theme.sh',
//       params: { userId, sandboxId, storeUrl, apiKey },
//       vmInstance: 'theme-builder-vm',
//       timeout: 120000 // 2 minutes for shopify theme pull
//     })
//
//     return {
//       success: true,
//       output: result.stdout
//     }
//   } catch (error) {
//     return {
//       success: false,
//       error: error.message
//     }
//   }
// }