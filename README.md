# Engine-Pexels

An enhanced Model Context Protocol (MCP) server that provides comprehensive access to the Pexels API with automatic downloading capabilities. This server allows AI models to search for, retrieve, and automatically download photos and videos from Pexels to a configured workspace directory.

## Credits

This project is forked and enhanced from the original [pexels-mcp-server](https://github.com/CaullenOmdahl/pexels-mcp-server) by [@CaullenOmdahl](https://github.com/CaullenOmdahl). The original provided the foundation for Pexels API integration, and this version adds workspace configuration and automatic file downloading capabilities.

## Features

- **Enhanced Download Capabilities**: Automatically download images and videos to your local workspace
- **Workspace Management**: Configure a root workspace directory for organized file storage
- **Flexible Path Control**: Specify relative save paths for precise file organization
- Search for photos and videos by query, orientation, size, and color
- Access curated and popular content from Pexels
- Browse Pexels collections
- Get detailed information about specific photos and videos
- Access content via tools or direct URI resources
- Comprehensive rate limit tracking and attribution handling

## Requirements

- Node.js 18 or higher
- A Pexels API key (get one at [https://www.pexels.com/api/](https://www.pexels.com/api/))

## Local Development

1. Clone the repository
2. Install dependencies
   ```bash
   pnpm install
   ```
3. Build the project
   ```bash
   pnpm build
   ```
4. Run in development mode
   ```bash
   PEXELS_API_KEY=your_api_key pnpm dev
   ```

## Configuration

The server requires two environment variables:

- `PEXELS_API_KEY`: Your Pexels API key (required)
- `WORKSPACE_PATH`: Root directory where files will be downloaded (required for download functionality)

### Claude MCP Configuration Example

Add this to your MCP settings file:

```json
{
  "mcpServers": {
    "engine-pexels": {
      "command": "npx",
      "args": ["engine-pexels"],
      "env": {
        "PEXELS_API_KEY": "your_pexels_api_key",
        "WORKSPACE_PATH": "/path/to/your/workspace"
      }
    }
  }
}
```

Alternative local development configuration:
```json
{
  "mcpServers": {
    "engine-pexels": {
      "command": "node",
      "args": ["/path/to/engine-pexels/dist/main.js"],
      "env": {
        "PEXELS_API_KEY": "your_pexels_api_key",
        "WORKSPACE_PATH": "/path/to/your/workspace"
      }
    }
  }
}
```

## Usage Example

1. **Search for photos**:
   ```javascript
   searchPhotos("mountain landscape")
   ```

2. **Download a specific photo**:
   ```javascript
   downloadPhoto({
     id: 12345,
     size: "large",
     relative_save_path: "images/landscapes/mountain.jpg"
   })
   // File will be saved to: /path/to/your/workspace/images/landscapes/mountain_large.jpg
   ```

3. **Set API key at runtime** (if needed):
   ```javascript
   setApiKey("your_pexels_api_key")
   ```

## Key Enhancements from Original

This enhanced version adds several key features over the original pexels-mcp-server:

- **Automatic File Downloads**: No more manual curl commands - files are downloaded directly to your workspace
- **Workspace Configuration**: Set a root directory for organized file management  
- **Smart File Naming**: Files include size/quality information to prevent conflicts
- **Directory Creation**: Automatically creates nested directory structures as needed
- **Better Error Handling**: Comprehensive error reporting for file operations and API calls

## Deploying to Smithery

This MCP server can be deployed to Smithery. Follow these steps:

1. Add the server to Smithery or claim an existing server
2. Go to the Deployments tab (only visible to authenticated owners)
3. Deploy the server
4. When configuring the deployment, provide your Pexels API key in the configuration settings

## API Usage

The server provides the following tools:

### Configuration Tools

- `setApiKey`: Set your Pexels API key for authentication.

### Photo Tools

- `searchPhotos`: Search for photos by query (use descriptive keywords for relevant results, e.g., 'Thai hotel reception', 'red sports car driving', not just 'hotel' or 'car'; combine with parameters like `orientation`, `size`, `color`, and `locale` for refined results), with optional filters for orientation, size, color, locale (e.g., 'en-US', 'es-ES'), page, and results per page. Returns metadata including photo IDs and URLs, plus current API rate limit status.
- `downloadPhoto`: Downloads a specific photo by its ID and desired size to the specified relative path within the workspace. Parameters: `id` (photo ID), `size` (optional, defaults to 'original'), and `relative_save_path` (relative path from workspace). Available sizes: 'original', 'large2x', 'large', 'medium', 'small', 'portrait', 'landscape', 'tiny'. The photo is automatically downloaded and saved to the combined workspace + relative path location.
- `getCuratedPhotos`: Retrieve a curated set of photos from Pexels, optionally paginated.
- `getPhoto`: Retrieve detailed information about a specific photo by its ID.

### Video Tools

- `searchVideos`: Search for videos by query (use descriptive keywords for relevant results, e.g., 'drone footage beach sunset', 'time lapse city traffic', not just 'beach' or 'city'; combine with parameters like `orientation` and `size` for refined results), with optional filters for orientation, size, locale (e.g., 'en-US', 'es-ES'), page, and results per page. Returns metadata including video IDs and URLs, plus current API rate limit status.
- `getPopularVideos`: Retrieve a list of popular videos from Pexels, with optional filters for dimensions, duration, page, and results per page.
- `getVideo`: Retrieve detailed information about a specific video by its ID.
- `downloadVideo`: Downloads a specific video by its ID and preferred quality to the specified relative path within the workspace. Parameters: `id` (video ID), `quality` (optional, 'hd' or 'sd', defaults to 'hd'), and `relative_save_path` (relative path from workspace). The video is automatically downloaded and saved to the combined workspace + relative path location.

### Collection Tools

- `getFeaturedCollections`: Retrieve a list of featured collections from Pexels, optionally paginated.
- ~~`getMyCollections`~~: (Commented out in code) Requires OAuth 2.0 authentication, not supported by this server.
- `getCollectionMedia`: Retrieve media items (photos or videos) from a specific collection by collection ID, with optional filters for type, sort order, page, and results per page.

### Resources

The server provides the following URI-addressable resources:

- `pexels-photo://{id}`: Access a specific photo by ID
- `pexels-video://{id}`: Access a specific video by ID
- `pexels-collection://{id}`: Access a specific collection by ID

## Error Handling

The server attempts to provide informative error messages for common issues like invalid API keys, rate limits, or missing resources. Successful responses also include the current Pexels API rate limit status (remaining requests, reset time) in the output.

## Attribution Requirements

When using the Pexels API, you must follow their attribution requirements:

- Always show a prominent link to Pexels (e.g., "Photos provided by Pexels")
- Always credit photographers (e.g., "Photo by John Doe on Pexels")

## License

ISC