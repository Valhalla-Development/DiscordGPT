import { dirname } from '@discordx/importer';
import { ClusterManager } from 'discord-hybrid-sharding';
import { config } from './config/Config.js';

// Get the directory path of the current module
const dir = dirname(import.meta.url);

/**
 * Cluster Manager Configuration
 *
 * This manager handles the sharding of the bot across multiple processes.
 * - totalShards: 'auto' - Discord.js will automatically calculate required shards (1 per 2500 servers)
 * - totalClusters: 'auto' - Automatically calculated based on totalShards and shardsPerClusters
 * - shardsPerClusters: 2 - Each cluster will handle 2 shards
 * - mode: 'worker' - Uses worker threads for better performance
 *
 * Example with 4 shards:
 * - Cluster 0: Handles shards 0 and 1
 * - Cluster 1: Handles shards 2 and 3
 */
const manager = new ClusterManager(`${dir}/Main.ts`, {
    totalShards: 'auto',
    totalClusters: 'auto',
    shardsPerClusters: 2,
    mode: 'worker',
    token: config.BOT_TOKEN,
});

// Event fired when a new cluster is created
manager.on('clusterCreate', (cluster) => {
    console.log(`[Cluster ${cluster.id}] Initialized successfully`);
});

// Spawns all clusters and shards
await manager.spawn({ timeout: -1 });
