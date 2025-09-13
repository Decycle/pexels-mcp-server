import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PexelsService } from "./services/pexels-service.js";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

// Create an MCP server
const server = new McpServer({
  name: "PexelsMCP",
  version: "1.0.0",
});

// Initialize Pexels service - API key should be provided via environment variable PEXELS_API_KEY
const pexelsService = new PexelsService();

// Configuration state for workspace path
let workspacePath: string = "";

// --- Photo API Tools ---

// Tool for searching photos
server.tool(
  "searchPhotos",
  {
    query: z.string().describe("The search query. Use descriptive keywords for relevant results (e.g., 'Thai hotel reception', 'red sports car driving', not just 'hotel' or 'car'). Combine with parameters like 'orientation', 'size', and 'color' for refined results."),
    orientation: z.enum(["landscape", "portrait", "square"]).optional().describe("Desired photo orientation"),
    size: z.enum(["large", "medium", "small"]).optional().describe("Minimum photo size"),
    color: z.string().optional().describe("Desired photo color (e.g., 'red', 'blue', '#ff0000')"),
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)"),
    locale: z.string().optional().describe("The locale of the search query (e.g., 'en-US', 'es-ES')."),
    // download: z.boolean().optional().describe("If true, download the top image and return as a file with attribution") // Download handled by separate tool
  },
  async ({ query, orientation, size, color, page, perPage, locale }) => {
    // Note: The 'download' parameter is kept in the schema for potential future use
    // but the download logic is now handled by the dedicated 'downloadPhoto' tool.
    try {
      const response = await pexelsService.searchPhotos(query, {
        orientation,
        size,
        color,
        locale, // Pass locale
        page,
        per_page: perPage
      });

      const results = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info

      const content: any[] = [
        {
          type: "text",
          text: `Found ${results.total_results} photos matching "${query}"`
        },
        {
          type: "text", // Return JSON as stringified text
          text: JSON.stringify(results, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching photos: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool for downloading a photo by ID
server.tool(
  "downloadPhoto",
  {
    id: z.number().positive().describe("The ID of the photo to download"),
    size: z.enum(['original', 'large2x', 'large', 'medium', 'small', 'portrait', 'landscape', 'tiny'])
           .optional().default('original')
           .describe("Desired photo size/version to download"),
    relative_save_path: z.string().describe("The relative path from workspace where the image should be saved"),
  },
  async ({ id, size, relative_save_path }: { id: number; size?: string; relative_save_path: string }) => {
    try {
      // Check if workspace path is configured
      if (!workspacePath) {
        return {
          content: [
            {
              type: "text",
              text: "Workspace path not configured. Please use setWorkspacePath tool first."
            }
          ]
        };
      }

      const response = await pexelsService.getPhoto(id);
      const photo = response.data;
      const rateLimit = response.rateLimit;

      if (!photo) {
        return {
          content: [
            { type: "text", text: `Photo with ID ${id} not found.` }
          ]
        };
      }

      // Select the URL based on the requested size
      const availableSizes = photo.src;
      let imageUrl = availableSizes[size as keyof typeof availableSizes] || availableSizes.original;
      let actualSize = size || 'original';

      // Fallback logic if requested size isn't directly available
      if (!imageUrl) {
        console.warn(`Requested size '${size}' not found for photo ${id}, falling back to 'original'.`);
        imageUrl = availableSizes.original;
        actualSize = 'original';
      }
      if (!imageUrl) {
        return { content: [{ type: "text", text: `Could not find any download URL for photo ID ${id}.` }] };
      }

      // Construct the full save path
      const fullSavePath = path.join(workspacePath, relative_save_path);
      
      // Ensure the directory exists
      await fs.mkdir(path.dirname(fullSavePath), { recursive: true });

      // Determine file extension and final filename
      const ext = path.extname(new URL(imageUrl).pathname) || ".jpg";
      const fileName = path.basename(relative_save_path, path.extname(relative_save_path)) + `_${actualSize}${ext}`;
      const finalPath = path.join(path.dirname(fullSavePath), fileName);

      // Download the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      await fs.writeFile(finalPath, buffer);

      const content: any[] = [
        {
          type: "text",
          text: `Photo downloaded successfully to: ${finalPath}`
        },
        {
          type: "text",
          text: `Photo ID: ${photo.id}, Size: ${actualSize}, File size: ${buffer.length} bytes`
        },
        {
          type: "text",
          text: `Attribution: Photo by ${photo.photographer} (${photo.photographer_url}) on Pexels. License: https://www.pexels.com/license/`
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error downloading photo: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);
// Removed duplicated code section

// Tool for downloading a video by ID
server.tool(
  "downloadVideo",
  {
    id: z.number().positive().describe("The ID of the video to download"),
    quality: z.enum(["hd", "sd"]).optional().default("hd").describe("Preferred video quality (hd or sd)"),
    relative_save_path: z.string().describe("The relative path from workspace where the video should be saved"),
  },
  async ({ id, quality, relative_save_path }: { id: number; quality?: string; relative_save_path: string }) => {
    try {
      // Check if workspace path is configured
      if (!workspacePath) {
        return {
          content: [
            {
              type: "text",
              text: "Workspace path not configured. Please use setWorkspacePath tool first."
            }
          ]
        };
      }

      const response = await pexelsService.getVideo(id);
      const videoData = response.data;
      const rateLimit = response.rateLimit;

      if (!videoData) {
        return {
          content: [
            { type: "text", text: `Video with ID ${id} not found.` }
          ]
        };
      }

      // Find the video file URL for the desired quality
      const videoFile = videoData.video_files.find((vf: { quality: string; }) => vf.quality === quality) || videoData.video_files[0];
      if (!videoFile) {
        return {
          content: [
            { type: "text", text: `No video file found for ID ${id}.` }
          ]
        };
      }

      // Construct the full save path
      const fullSavePath = path.join(workspacePath, relative_save_path);
      
      // Ensure the directory exists
      await fs.mkdir(path.dirname(fullSavePath), { recursive: true });

      // Determine file extension and final filename
      const ext = path.extname(new URL(videoFile.link).pathname) || ".mp4";
      const fileName = path.basename(relative_save_path, path.extname(relative_save_path)) + `_${videoFile.quality}${ext}`;
      const finalPath = path.join(path.dirname(fullSavePath), fileName);

      // Download the video
      const videoResponse = await fetch(videoFile.link);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }

      const arrayBuffer = await videoResponse.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      await fs.writeFile(finalPath, buffer);

      const content: any[] = [
        {
          type: "text",
          text: `Video downloaded successfully to: ${finalPath}`
        },
        {
          type: "text",
          text: `Video ID: ${videoData.id}, Quality: ${videoFile.quality}, File size: ${buffer.length} bytes`
        },
        {
          type: "text",
          text: `Attribution: Video by ${videoData.user.name} (${videoData.user.url}) on Pexels. License: https://www.pexels.com/license/`
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error downloading video: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool for getting curated photos
server.tool(
  "getCuratedPhotos",
  {
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)")
  },
  async ({ page, perPage }: { page?: number, perPage?: number }) => { // Added explicit types
    try {
      const response = await pexelsService.getCuratedPhotos({
        page,
        per_page: perPage
      });

      const results = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved ${results.photos.length} curated photos`
        },
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: "text", 
            text: `Error getting curated photos: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool for getting a specific photo by ID
server.tool(
  "getPhoto", 
  { 
    id: z.number().positive().describe("The ID of the photo to retrieve")
  }, 
  async ({ id }) => {
    try {
      const response = await pexelsService.getPhoto(id);
      const photo = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info

      if (!photo) {
         return { content: [{ type: "text", text: `Photo with ID ${id} not found.` }] };
      }
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved photo: ${photo.alt || photo.url}`
        },
        {
          type: "text",
          text: JSON.stringify(photo, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error getting photo: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// --- Video API Tools ---

// Tool for searching videos
server.tool(
  "searchVideos", 
  { 
    query: z.string().describe("The search query. Use descriptive keywords for relevant results (e.g., 'drone footage beach sunset', 'time lapse city traffic', not just 'beach' or 'city'). Combine with parameters like 'orientation' and 'size' for refined results."),
    orientation: z.enum(["landscape", "portrait", "square"]).optional().describe("Desired video orientation"),
    size: z.enum(["large", "medium", "small"]).optional().describe("Minimum video size"),
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)"),
    locale: z.string().optional().describe("The locale of the search query (e.g., 'en-US', 'es-ES').")
  },
  async ({ query, orientation, size, page, perPage, locale }) => {
    try {
      const response = await pexelsService.searchVideos(query, {
        orientation,
        size,
        locale, // Pass locale
        page,
        per_page: perPage
      });

      const results = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info
      
      const content: any[] = [
        {
          type: "text",
          text: `Found ${results.total_results} videos matching "${query}"`
        },
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error searching videos: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool for getting popular videos
server.tool(
  "getPopularVideos", 
  { 
    minWidth: z.number().optional().describe("Minimum video width in pixels"),
    minHeight: z.number().optional().describe("Minimum video height in pixels"),
    minDuration: z.number().optional().describe("Minimum video duration in seconds"),
    maxDuration: z.number().optional().describe("Maximum video duration in seconds"),
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)") 
  }, 
  async ({ minWidth, minHeight, minDuration, maxDuration, page, perPage }) => {
    try {
      const response = await pexelsService.getPopularVideos({
        min_width: minWidth,
        min_height: minHeight,
        min_duration: minDuration,
        max_duration: maxDuration,
        page,
        per_page: perPage
      });

      const results = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved ${results.videos.length} popular videos`
        },
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error getting popular videos: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool for getting a specific video by ID
server.tool(
  "getVideo", 
  { 
    id: z.number().positive().describe("The ID of the video to retrieve")
  }, 
  async ({ id }) => {
    try {
      const response = await pexelsService.getVideo(id);
      const video = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info

      if (!video) {
        return { content: [{ type: "text", text: `Video with ID ${id} not found.` }] };
      }
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved video with ID: ${id}`
        },
        {
          type: "text",
          text: JSON.stringify(video, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error getting video: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// --- Collections API Tools ---

// Tool for getting featured collections
server.tool(
  "getFeaturedCollections", 
  { 
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)") 
  }, 
  async ({ page, perPage }) => {
    try {
      const response = await pexelsService.getFeaturedCollections({
        page,
        per_page: perPage
      });

      const collections = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved ${collections.collections.length} featured collections`
        },
        {
          type: "text",
          text: JSON.stringify(collections, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error getting featured collections: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

/*
// NOTE: Accessing user-specific collections ('My Collections') typically requires
// OAuth 2.0 authentication with Pexels, which is not implemented here.
// This tool will likely only work if Pexels allows API key access to this endpoint,
// or it might return an error or empty results without proper user authentication.
// Tool for getting user's collections - Commented out due to auth requirements.
server.tool(
  "getMyCollections",
  {
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)")
  },
  async ({ page, perPage }) => {
    try {
      const collections = await pexelsService.getMyCollections({
        page,
        per_page: perPage
      });

      return {
        content: [
          {
            type: "text",
            text: `Retrieved ${collections.collections.length} of your collections`
          },
          {
            type: "text",
            text: JSON.stringify(collections, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting your collections: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);
*/

// Tool for getting media from a collection
server.tool(
  "getCollectionMedia", 
  { 
    id: z.string().describe("The ID of the collection"),
    type: z.enum(["photos", "videos"]).optional().describe("Filter by media type"),
    sort: z.enum(["asc", "desc"]).optional().describe("Sort order"),
    page: z.number().positive().optional().describe("Page number"),
    perPage: z.number().min(1).max(80).optional().describe("Results per page (max 80)") 
  }, 
  async ({ id, type, sort, page, perPage }) => {
    try {
      const response = await pexelsService.getCollectionMedia(id, {
        type,
        sort,
        page,
        per_page: perPage
      });

      const media = response.data; // Access the actual data
      const rateLimit = response.rateLimit; // Get rate limit info
      
      const content: any[] = [
        {
          type: "text",
          text: `Retrieved ${media.media.length} media items from collection ${id}`
        },
        {
          type: "text",
          text: JSON.stringify(media, null, 2)
        }
      ];

      // Add rate limit info if available
      if (rateLimit) {
        const resetDate = rateLimit.reset ? new Date(rateLimit.reset * 1000).toISOString() : 'N/A';
        content.push({
          type: "text",
          text: `\nRate Limit: ${rateLimit.remaining ?? 'N/A'}/${rateLimit.limit ?? 'N/A'} requests remaining this period. Resets at ${resetDate}.`
        });
      }

      return { content };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error getting collection media: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// --- Photo Resources ---

// Resource for accessing photos by ID
server.resource(
  "photo",
  new ResourceTemplate("pexels-photo://{id}", { list: undefined }),
  async (uri, { id }) => {
    try {
      const photoId = parseInt((id ?? "").toString(), 10);
      if (isNaN(photoId)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Invalid photo ID: ${id ?? ""}`,
            },
          ],
        };
      }

      const photo = await pexelsService.getPhoto(photoId);
      
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(photo, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving photo with ID ${id}: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

// --- Video Resources ---

// Resource for accessing videos by ID
server.resource(
  "video",
  new ResourceTemplate("pexels-video://{id}", { list: undefined }),
  async (uri, { id }) => {
    try {
      const videoId = parseInt((id ?? "").toString(), 10);
      if (isNaN(videoId)) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Invalid video ID: ${id ?? ""}`,
            },
          ],
        };
      }

      const video = await pexelsService.getVideo(videoId);
      
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(video, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving video with ID ${id}: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

// --- Collection Resources ---

// Resource for accessing collections by ID
server.resource(
  "collection",
  new ResourceTemplate("pexels-collection://{id}", { list: undefined }),
  async (uri, { id }) => {
    try {
      const media = await pexelsService.getCollectionMedia((id ?? "").toString());
      
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(media, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error retrieving collection with ID ${id}: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

// Tool to set API key for clients that need to provide their own key
server.tool(
  "setApiKey", 
  { 
    apiKey: z.string().describe("Your Pexels API key")
  }, 
  async ({ apiKey }) => {
    try {
      pexelsService.setApiKey(apiKey);
      
      return {
        content: [
          { 
            type: "text", 
            text: "API key set successfully"
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          { 
            type: "text", 
            text: `Error setting API key: ${(error as Error).message}`
          }
        ]
      };
    }
  }
);

// Tool to configure workspace path for downloads
server.tool(
  "setWorkspacePath",
  {
    workspacePath: z.string().describe("The root workspace path where images/videos will be downloaded")
  },
  async ({ workspacePath: newWorkspacePath }: { workspacePath: string }) => {
    try {
      // Validate that the path exists
      await fs.access(newWorkspacePath);
      workspacePath = newWorkspacePath;
      
      return {
        content: [
          {
            type: "text",
            text: `Workspace path set to: ${workspacePath}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error setting workspace path: ${(error as Error).message}. Please ensure the directory exists.`
          }
        ]
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);