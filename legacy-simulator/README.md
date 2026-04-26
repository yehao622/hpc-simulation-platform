# Legacy OMNeT++ Simulator

## Session 1 Status: Placeholder Directory

This directory is a placeholder for the existing OMNeT++ HPC simulation code.

### For Session 1 (Foundation)
- ✅ Directory structure created
- ✅ Docker build compatibility ensured
- ⏳ Actual simulator integration planned for Session 2

### Next Steps for Session 2
1. Copy the existing OMNeT++ simulator files here
2. Integrate with Python worker scripts
3. Set up simulation job processing pipeline

### Expected Structure (Session 2)
```
legacy-simulator/
├── src/                 # the OMNeT++ source files
├── simulations/         # Simulation configurations  
├── results/            # Output directory
├── Makefile           # Build configuration
└── omnetpp.ini        # OMNeT++ configuration
```

### Original Simulator Features
Based on the existing code, this will include:
- Fat-tree network topology simulation
- Storage system modeling (OSS/OST)
- Multiple interconnect support (InfiniBand, PCIe, SAS)
- Configurable workload patterns
- Performance metrics collection

---
*This placeholder ensures Docker builds successfully in Session 1*
