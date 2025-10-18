// ==============================
// IT-CMF Dashboard Main Script
// ==============================

// --- Load all data safely ---
async function initGraph() {
  try {
    const [nodes, links, cbblinks, objectives, artifacts] = await Promise.all([
      d3.json("nodes.json"),
      d3.json("links.json"),
      d3.json("cbblinks.json"),
      d3.json("objectives_grouped.json"),
      d3.json("artifacts_grouped.json")
    ]);

    if (!nodes?.length || !links?.length) {
      console.error("⚠️ Data not loaded correctly. Nodes or links array is empty.");
      return;
    }

    console.log(`✅ Data loaded: ${nodes.length} nodes, ${links.length} links`);
    console.log(`📘 Objectives: ${objectives.length}, Artifacts: ${artifacts.length}`);

    // --- Normalize IDs to strings for consistency ---
    nodes.forEach(n => (n.id = n.id.toString()));
    links.forEach(l => {
      l.source = l.source.toString();
      l.target = l.target.toString();
    });

    buildGraph(nodes, links, cbblinks, objectives, artifacts);

  } catch (err) {
    console.error("❌ Error loading data:", err);
  }
}

initGraph();

// ==============================
// Build the graph visualization
// ==============================
function buildGraph(nodes, links, cbblinks, objectives, artifacts) {

  // --- Map lookups ---
  const cbbMap = {};
  cbblinks.forEach(d => {
    cbbMap[d.id] = d.cbbs;
  });

  const objectivesMap = {};
  objectives.forEach(d => { objectivesMap[d.id] = d.objectives || []; });

  const artifactsMap = {};
  artifacts.forEach(d => { artifactsMap[d.id] = d.artifacts || []; });

  let selectedNode = null;

  // --- SVG setup ---
  const graphDiv = document.getElementById("graph");
  let width = graphDiv.clientWidth //|| 800;
  let height = graphDiv.clientHeight //|| 600;

  const svg = d3.select("#graph").append("svg")
    .attr("width", width)
    .attr("height", height);

  const container = svg.append("g");

  // --- Define zoom separately so we can reuse it in search ---
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);

  // --- Color palette ---
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  // --- Links ---
  const link = container.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "link")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.6);

  // --- Nodes ---
  const node = container.append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("class", "node")
    .attr("r", 8)
    .attr("fill", d => color(d.group))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended)
    );

  // --- Labels ---
  const label = container.append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "label")
    .text(d => d.name_short || d.name)
    .attr("font-size", 10)
    .attr("fill", "#333")
    .attr("x", 14)
    .attr("y", 4);

  // --- Force simulation ---
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(150).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(30))
    .on("tick", ticked);

  function ticked() {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 4);
  }

  // --- Drag functions ---
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  // --- Highlight logic ---
  function highlightNode(selected) {
    const connected = new Set();
    links.forEach(l => {
      if (l.source.id === selected.id || l.target.id === selected.id) {
        connected.add(l.source.id);
        connected.add(l.target.id);
      }
    });

    node.classed("highlighted", d => connected.has(d.id))
        .classed("faded", d => !connected.has(d.id));
    link.classed("highlighted", d => d.source.id === selected.id || d.target.id === selected.id)
        .classed("faded", d => !(d.source.id === selected.id || d.target.id === selected.id));
    label.classed("highlighted", d => connected.has(d.id))
         .classed("faded", d => !connected.has(d.id));
  }

  function resetHighlights() {
    node.classed("highlighted", false).classed("faded", false);
    link.classed("highlighted", false).classed("faded", false);
    label.classed("highlighted", false).classed("faded", false);
  }

  // --- Click handling ---
  node.on("click", (event, d) => {
    event.stopPropagation();

    if (selectedNode && selectedNode.id === d.id) {
      resetPanels();
      resetHighlights();
      selectedNode = null;
      return;
    }

    selectedNode = d;
    highlightNode(d);
    showNodeDetails(d);
    showCBBDetails(d);
    showObjectives(d);
    showArtifacts(d);
  });

  svg.on("click", () => {
    if (selectedNode) {
      resetPanels();
      resetHighlights();
      selectedNode = null;
    }
  });

  // --- Reset panels ---
  function resetPanels() {
    d3.select("#nodeDetails").html("<h2>Node Details</h2><p>Click a node to view details.</p>");
    d3.select("#cbbDetails").html("<h2>CBB Details</h2><p>Click a node to view details.</p>");
    d3.select("#summaryDetails").html("<h2>Objectives</h2><p>Click a node to view objectives.</p>");
    d3.select("#extraPanel").html("<h2>Artifacts</h2><p>Click a node to view artifacts.</p>");
  }

  // --- Node Details ---
  function showNodeDetails(d) {
    const nodeData = nodes.find(n => n.id === d.id) || d;
    d3.select("#nodeDetails").html(`
      <div class="node-data">
        <h2>${nodeData.name}</h2>
        <p><strong>ID:</strong> ${nodeData.id}</p>
        <p><strong>Group:</strong> ${nodeData.group || "N/A"}</p>
        <p><strong>Overview:</strong> ${nodeData.overview || "N/A"}</p>
        <p><strong>Goal:</strong> ${nodeData.goal || "N/A"}</p>
        <p><strong>Definition:</strong> ${formatDefinition(nodeData.definitions || "N/A")}</p>
      </div>
    `);
  }

  function formatDefinition(defText) {
    if (!defText || typeof defText !== "string") return "<p>N/A</p>";
    const [intro, ...rest] = defText.split(/(?=\d+\))/);
    const listItems = rest.map(p => `<li>${p.replace(/^\d+\)\s*/, "").trim()}</li>`).join("");
    return `${intro ? `<p>${intro.trim()}</p>` : ""}${listItems ? `<ol>${listItems}</ol>` : ""}`;
  }

  // --- CBB Details ---
  function showCBBDetails(d) {
    const cbbs = cbbMap[d.id] || [];
    if (!cbbs.length) {
      d3.select("#cbbDetails").html("<h2>CBB Details</h2><p>No CBB data found.</p>");
      return;
    }

    const html = cbbs.map(cbb => `
      <div class="cbb-item">
        <strong>${cbb.cbb}</strong>
        <p>${cbb.definition}</p>
      </div>
    `).join("");

    d3.select("#cbbDetails").html(`<h2>CBB Details</h2>${html}`);
  }

  // --- Objectives ---
  function showObjectives(d) {
    const items = objectivesMap[d.id] || [];
    if (!items.length) {
      d3.select("#summaryDetails").html("<h2>Objectives</h2><p>No objectives listed for this node.</p>");
      return;
    }

    const html = items.map(item => `<div class="obj-item">${item}</div>`).join("");
    d3.select("#summaryDetails").html(`<h2>Objectives</h2>${html}`);
  }

  // --- Artifacts ---
  function showArtifacts(d) {
    const items = artifactsMap[d.id] || [];
    if (!items.length) {
      d3.select("#extraPanel").html("<h2>Artifacts</h2><p>No artifacts listed for this node.</p>");
      return;
    }

    const html = items.map(item => `<div class="artifact-item">${item}</div>`).join("");
    d3.select("#extraPanel").html(`<h2>Artifacts</h2>${html}`);
  }

  // ==============================
  // Search Functionality
  // ==============================
const searchInput = document.getElementById("nodeSearch");

if (searchInput) {
  searchInput.addEventListener("keyup", (event) => {
    const query = event.target.value.trim().toLowerCase();

    if (query) {
      // Find node by name or short name (case-insensitive)
      const matchedNode = nodes.find(n => {
        const fullName = (n.name || "").toLowerCase();
        const shortName = (n.name_short || "").toLowerCase();
        return fullName.includes(query) || shortName.includes(query);
      });

      if (matchedNode) {
        // Reset previous highlights
        resetHighlights();

        selectedNode = matchedNode;
        highlightNode(matchedNode);
        showNodeDetails(matchedNode);
        showCBBDetails(matchedNode);
        showObjectives(matchedNode);
        showArtifacts(matchedNode);

        // Smoothly center the graph on the node (optional)
        const zoom = d3.zoom().scaleExtent([0.1, 4])
          .on("zoom", (event) => container.attr("transform", event.transform));

        svg.transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(width / 2 - matchedNode.x, height / 2 - matchedNode.y)
          );
      } else {
        alert(`No matching node found for "${query}". Try a different name or short code.`);
      }
    }
  });
}

}

