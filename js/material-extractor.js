/**
 * GLB Extractor Tool - Material Extractor
 * Contains functions for extracting materials from GLB/GLTF files
 */

// Use utility functions from the main modules
const { log, packGLB, sanitizeGLTF } = window.GlbExtractorUtils;

/**
 * Extract materials from a GLTF structure
 * @param {Object} gltf - The GLTF JSON structure
 * @returns {Array} - An array of extracted materials
 */
function extractMaterialsFromGLTF(gltf) {
    const materials = [];
    
    if (!gltf.materials || gltf.materials.length === 0) {
        log('No materials defined in GLTF structure');
        return materials;
    }
    
    log(`Found ${gltf.materials.length} materials in GLTF structure`);
    
    // Process each material
    gltf.materials.forEach((material, materialIndex) => {
        try {
            const materialName = material.name || `material_${materialIndex}`;
            log(`Processing material: ${materialName}`);
            
            // Find primitives that use this material
            const meshPrimitiveCount = countPrimitivesUsingMaterial(gltf, materialIndex);
            
            // Get material color (if available)
            let materialColor = null;
            if (material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor) {
                materialColor = material.pbrMetallicRoughness.baseColorFactor;
            }
            
            // Get textures used by this material
            const textureIndices = findTexturesUsedByMaterial(gltf, material);
            
            materials.push({
                name: materialName,
                index: materialIndex,
                primitiveCount: meshPrimitiveCount,
                color: materialColor,
                textureIndices: textureIndices
            });
            
            log(`Material ${materialName} uses ${textureIndices.length} textures and appears in ${meshPrimitiveCount} primitives`);
        } catch (error) {
            console.error(`Error processing material ${materialIndex}:`, error);
            log(`Error processing material ${materialIndex}: ${error.message}`, 'error');
        }
    });
    
    return materials;
}

/**
 * Count the number of primitives using a specific material
 * @param {Object} gltf - The GLTF JSON structure
 * @param {number} materialIndex - The index of the material
 * @returns {number} - The number of primitives using the material
 */
function countPrimitivesUsingMaterial(gltf, materialIndex) {
    let count = 0;
    
    if (!gltf.meshes) {
        return count;
    }
    
    // Count all primitives using this material
    gltf.meshes.forEach(mesh => {
        if (mesh.primitives) {
            mesh.primitives.forEach(primitive => {
                if (primitive.material === materialIndex) {
                    count++;
                }
            });
        }
    });
    
    return count;
}

/**
 * Find textures used by a material
 * @param {Object} gltf - The GLTF JSON structure
 * @param {Object} material - The material to check
 * @returns {Array} - An array of texture indices used by the material
 */
function findTexturesUsedByMaterial(gltf, material) {
    const textureIndices = new Set();
    
    // Check PBR materials
    if (material.pbrMetallicRoughness) {
        checkTextureRef(material.pbrMetallicRoughness.baseColorTexture);
        checkTextureRef(material.pbrMetallicRoughness.metallicRoughnessTexture);
    }
    
    // Check other common texture types
    checkTextureRef(material.normalTexture);
    checkTextureRef(material.occlusionTexture);
    checkTextureRef(material.emissiveTexture);
    
    function checkTextureRef(textureInfo) {
        if (textureInfo && textureInfo.index !== undefined) {
            textureIndices.add(textureInfo.index);
        }
    }
    
    return Array.from(textureIndices);
}

/**
 * Generate a unique color for a material based on its index
 * @param {number} index - The index of the material
 * @returns {Array} - RGBA color values as [r, g, b, a]
 */
function generateColorFromIndex(index) {
    // Use a simple but colorful formula to get repeatable colors
    // This uses HSL to ensure we get vibrant colors
    const hue = (index * 137.5) % 360;  // Golden angle approximation for good distribution
    const saturation = 0.75;            // High saturation for vibrant colors
    const lightness = 0.6;              // Medium-light for visibility
    
    // Convert HSL to RGB
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness - c/2;
    
    let r, g, b;
    if (hue < 60) {
        [r, g, b] = [c, x, 0];
    } else if (hue < 120) {
        [r, g, b] = [x, c, 0];
    } else if (hue < 180) {
        [r, g, b] = [0, c, x];
    } else if (hue < 240) {
        [r, g, b] = [0, x, c];
    } else if (hue < 300) {
        [r, g, b] = [x, 0, c];
    } else {
        [r, g, b] = [c, 0, x];
    }
    
    return [r + m, g + m, b + m, 1.0];
}

/**
 * Create a GLB file for a specific material
 * @param {Object} gltfData - The original GLTF data
 * @param {number} materialIndex - The index of the material to extract
 * @returns {ArrayBuffer} - The GLB file for the material
 */
function createGLBForMaterial(gltfData, materialIndex) {
    try {
        log(`Creating simplified GLB file for material ${materialIndex} with unique color`);
        
        // Create a deep copy of the GLTF JSON structure
        const newGltf = JSON.parse(JSON.stringify(gltfData.json));
        
        // Add required asset information if missing
        if (!newGltf.asset) {
            newGltf.asset = {
                version: "2.0",
                generator: "Colored GLB Material Extractor v1.5"
            };
        } else {
            newGltf.asset.generator = "Colored GLB Material Extractor v1.5";
            newGltf.asset.version = "2.0";  // Ensure version is set correctly
        }
        
        // Keep track of what we're using
        let usedAccessors = new Set();
        let usedBufferViews = new Set();
        let usedNodes = new Set();
        
        // Generate a unique deterministic color for this material based on its index
        const baseColor = generateColorFromIndex(materialIndex);
        log(`Generated color for material ${materialIndex}: rgba(${baseColor.map(c => Math.round(c * 255)).join(', ')})`);
        
        // Get original material name if available
        let materialName = "material_" + materialIndex;
        if (newGltf.materials && newGltf.materials[materialIndex]) {
            materialName = newGltf.materials[materialIndex].name || materialName;
        }
        
        // Create a simple colored material
        const simpleMaterial = {
            name: materialName,
            pbrMetallicRoughness: {
                baseColorFactor: baseColor,
                metallicFactor: 0.0,
                roughnessFactor: 0.8
            }
        };
        
        // Replace all materials with our simple colored material
        newGltf.materials = [simpleMaterial];
        
        // Filter meshes to only include primitives with this material
        let keptMeshIndices = new Set();
        
        if (newGltf.meshes) {
            log(`Original mesh count: ${newGltf.meshes.length}`);
            
            newGltf.meshes = newGltf.meshes.filter((mesh, meshIndex) => {
                if (!mesh.primitives || mesh.primitives.length === 0) {
                    return false;
                }
                
                // Keep only primitives with the specified material
                const originalPrimitiveCount = mesh.primitives.length;
                mesh.primitives = mesh.primitives.filter(primitive => 
                    primitive.material === materialIndex
                );
                
                log(`Mesh ${meshIndex} (${mesh.name || 'unnamed'}): from ${originalPrimitiveCount} to ${mesh.primitives.length} primitives`);
                
                // If mesh has no primitives left, filter it out
                if (mesh.primitives.length === 0) {
                    return false;
                }
                
                keptMeshIndices.add(meshIndex);
                
                // Record the accessors used by the remaining primitives
                mesh.primitives.forEach(primitive => {
                    // Collect attributes
                    for (const attribute in primitive.attributes) {
                        usedAccessors.add(primitive.attributes[attribute]);
                    }
                    
                    // Collect indices
                    if (primitive.indices !== undefined) {
                        usedAccessors.add(primitive.indices);
                    }
                    
                    // Update material index
                    primitive.material = 0; // Reset to index 0 since we only have one material now
                });
                
                return true;
            });
            
            log(`Filtered down to ${newGltf.meshes.length} meshes`);
        }
        
        // Create mesh index mapping
        const oldToNewMeshIndex = {};
        if (newGltf.meshes) {
            newGltf.meshes.forEach((mesh, newIndex) => {
                const oldIndex = Array.from(keptMeshIndices)[newIndex];
                oldToNewMeshIndex[oldIndex] = newIndex;
            });
        }
        
        // Process nodes if they exist
        if (newGltf.nodes) {
            log(`Original node count: ${newGltf.nodes.length}`);
            
            // First pass: collect nodes that directly reference our meshes
            let nodesToKeep = new Set();
            
            newGltf.nodes.forEach((node, nodeIndex) => {
                if (node.mesh !== undefined && keptMeshIndices.has(node.mesh)) {
                    nodesToKeep.add(nodeIndex);
                    usedNodes.add(nodeIndex);
                    log(`Node ${nodeIndex} references kept mesh ${node.mesh}`);
                }
            });
            
            // Second pass: include all parent nodes to maintain hierarchy
            let previousSize = 0;
            while (previousSize !== nodesToKeep.size) {
                previousSize = nodesToKeep.size;
                
                newGltf.nodes.forEach((node, nodeIndex) => {
                    if (node.children) {
                        node.children.forEach(childIndex => {
                            if (nodesToKeep.has(childIndex) && !nodesToKeep.has(nodeIndex)) {
                                log(`Adding parent node ${nodeIndex} to keep hierarchy`);
                                nodesToKeep.add(nodeIndex);
                                usedNodes.add(nodeIndex);
                            }
                        });
                    }
                });
            }
            
            // If no nodes have been selected, create a new node
            if (nodesToKeep.size === 0 && newGltf.meshes && newGltf.meshes.length > 0) {
                log(`No nodes reference our meshes, creating a new node`);
                newGltf.nodes.push({
                    mesh: 0,
                    name: `${materialName}_node`
                });
                nodesToKeep.add(newGltf.nodes.length - 1);
                usedNodes.add(newGltf.nodes.length - 1);
            }
            
            // Filter and remap nodes
            const nodeIndices = Array.from(nodesToKeep);
            const oldToNewNodeIndex = {};
            
            const filteredNodes = nodeIndices.map((oldIndex, newIndex) => {
                oldToNewNodeIndex[oldIndex] = newIndex;
                
                // Clone the node
                const node = {...newGltf.nodes[oldIndex]};
                
                // Update mesh reference if present
                if (node.mesh !== undefined) {
                    if (keptMeshIndices.has(node.mesh)) {
                        node.mesh = oldToNewMeshIndex[node.mesh];
                    } else {
                        // If mesh was filtered out, remove the reference
                        delete node.mesh;
                    }
                }
                
                // Update children references
                if (node.children) {
                    node.children = node.children.filter(child => nodesToKeep.has(child))
                        .map(child => oldToNewNodeIndex[child]);
                    
                    // If no children left, remove the empty array
                    if (node.children.length === 0) {
                        delete node.children;
                    }
                }
                
                return node;
            });
            
            log(`Filtered down to ${filteredNodes.length} nodes`);
            newGltf.nodes = filteredNodes;
            
            // Ensure valid scene structure
            log(`Ensuring valid scene structure`);
            if (!newGltf.scenes || newGltf.scenes.length === 0) {
                newGltf.scenes = [{
                    nodes: Object.values(oldToNewNodeIndex)
                }];
                newGltf.scene = 0;
                log(`Created new scene with ${Object.values(oldToNewNodeIndex).length} root nodes`);
            } else {
                // Update scenes to only reference our kept nodes
                log(`Updating ${newGltf.scenes.length} existing scenes`);
                newGltf.scenes = newGltf.scenes.map((scene, sceneIndex) => {
                    if (!scene.nodes) {
                        log(`Scene ${sceneIndex} has no nodes, creating empty array`);
                        return { nodes: [] };
                    }
                    
                    return {
                        ...scene,
                        nodes: scene.nodes.filter(nodeIndex => nodesToKeep.has(nodeIndex))
                            .map(nodeIndex => oldToNewNodeIndex[nodeIndex])
                    };
                }).filter(scene => scene.nodes.length > 0);
                
                // If we lost all scenes, create a new one
                if (newGltf.scenes.length === 0) {
                    log(`All scenes filtered out, creating a new scene`);
                    newGltf.scenes = [{
                        nodes: Object.values(oldToNewNodeIndex)
                    }];
                }
                
                // Ensure scene index is valid
                newGltf.scene = 0;
            }
        } else if (newGltf.meshes && newGltf.meshes.length > 0) {
            // No nodes exist, create a simple node and scene structure
            log(`No nodes exist, creating basic node structure for ${newGltf.meshes.length} meshes`);
            newGltf.nodes = newGltf.meshes.map((mesh, index) => ({
                mesh: index,
                name: `${materialName}_node_${index}`
            }));
            
            newGltf.scenes = [{
                nodes: newGltf.nodes.map((_, index) => index)
            }];
            
            newGltf.scene = 0;
        }
        
        // IMPORTANT: Remove all textures, images, and samplers
        delete newGltf.textures;
        delete newGltf.images;
        delete newGltf.samplers;
        
        // Keep only accessors that are used
        if (newGltf.accessors && usedAccessors.size > 0) {
            log(`Original accessor count: ${newGltf.accessors.length}, used: ${usedAccessors.size}`);
            
            const accessorIndices = Array.from(usedAccessors);
            const oldToNewAccessorIndex = {};
            
            newGltf.accessors = accessorIndices.map((oldIndex, newIndex) => {
                oldToNewAccessorIndex[oldIndex] = newIndex;
                const accessor = {...newGltf.accessors[oldIndex]};
                
                // Record bufferView used by this accessor
                if (accessor.bufferView !== undefined) {
                    usedBufferViews.add(accessor.bufferView);
                    log(`Accessor ${oldIndex} uses bufferView ${accessor.bufferView}`);
                }
                
                return accessor;
            });
            
            // Update accessor indices in meshes
            if (newGltf.meshes) {
                newGltf.meshes.forEach(mesh => {
                    mesh.primitives.forEach(primitive => {
                        // Update attribute accessors
                        for (const attribute in primitive.attributes) {
                            const oldIndex = primitive.attributes[attribute];
                            primitive.attributes[attribute] = oldToNewAccessorIndex[oldIndex];
                        }
                        
                        // Update indices accessor
                        if (primitive.indices !== undefined) {
                            primitive.indices = oldToNewAccessorIndex[primitive.indices];
                        }
                    });
                });
            }
        }
        
        // Keep only bufferViews that are used and create a new binary chunk
        if (newGltf.bufferViews && usedBufferViews.size > 0 && gltfData.binaryChunk) {
            log(`Original bufferView count: ${newGltf.bufferViews.length}, used: ${usedBufferViews.size}`);
            
            const bufferViewIndices = Array.from(usedBufferViews);
            const oldToNewBufferViewIndex = {};
            
            // First, collect all bufferView data
            let bufferViewDataArray = [];
            
            bufferViewIndices.forEach(oldIndex => {
                const bufferView = {...newGltf.bufferViews[oldIndex]};
                const start = bufferView.byteOffset || 0;
                const length = bufferView.byteLength;
                
                log(`BufferView ${oldIndex}: offset=${start}, length=${length}`);
                
                try {
                    // Extract data from original binary chunk
                    const viewData = new Uint8Array(gltfData.binaryChunk.slice(start, start + length));
                    
                    bufferViewDataArray.push({
                        oldIndex,
                        data: viewData,
                        length,
                        bufferView
                    });
                } catch (error) {
                    log(`Error extracting bufferView ${oldIndex}: ${error.message}`, 'error');
                    throw error;
                }
            });
            
            // Calculate total new binary chunk size with alignment
            let totalLength = 0;
            
            bufferViewDataArray.forEach(view => {
                // Ensure 4-byte alignment for each buffer view
                const alignmentFactor = 4;
                const padding = (alignmentFactor - (totalLength % alignmentFactor)) % alignmentFactor;
                totalLength += padding;
                
                // Record new offset
                view.newOffset = totalLength;
                view.padding = padding;
                
                // Update bufferView object
                view.bufferView.byteOffset = totalLength;
                view.bufferView.buffer = 0;  // Always reference the first buffer
                
                totalLength += view.length;
            });
            
            log(`New binary chunk length: ${totalLength} bytes`);
            
            // Create new binary chunk
            const newBinaryChunk = new ArrayBuffer(totalLength);
            const newBinaryView = new Uint8Array(newBinaryChunk);
            
            // Fill with zeros first
            newBinaryView.fill(0);
            
            // Copy each buffer view data to its new position
            bufferViewDataArray.forEach(view => {
                newBinaryView.set(view.data, view.newOffset);
                
                // Update mapping
                oldToNewBufferViewIndex[view.oldIndex] = bufferViewDataArray.indexOf(view);
            });
            
            // Update the bufferViews array
            newGltf.bufferViews = bufferViewDataArray.map(view => view.bufferView);
            
            // Update bufferView indices in accessors
            if (newGltf.accessors) {
                newGltf.accessors.forEach(accessor => {
                    if (accessor.bufferView !== undefined) {
                        accessor.bufferView = oldToNewBufferViewIndex[accessor.bufferView];
                    }
                });
            }
            
            // Update buffer information
            newGltf.buffers = [{
                byteLength: totalLength
            }];
            
            // Sanitize the GLTF before packing
            sanitizeGLTF(newGltf);
            
            // Generate a new GLB file with our new binary chunk
            return packGLB(newGltf, newBinaryChunk);
        } else {
            // If no binary data, just pack the JSON
            log(`No binary data needed for this material`);
            newGltf.buffers = [];
            sanitizeGLTF(newGltf);
            return packGLB(newGltf, null);
        }
    } catch (error) {
        log(`Error creating GLB for material ${materialIndex}: ${error.message}`, 'error');
        console.error(error);
        return null;
    }
}