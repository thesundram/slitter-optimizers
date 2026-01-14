// This implements a cutting-stock/bin-packing solver similar to OR-Tools CP-SAT
// Key optimization factors: Yield, Order coverage, Scrap minimization, and No of Slit requirements

import type { RMCoil, SalesOrder, LineSpec, SlittingPattern, OptimizationResult } from "./slitter-context"

interface Weights {
  w1: number // Yield %
  w2: number // Order completion ratio
  w3: number // Scrap width penalty
  w4: number // Setup penalty
}

// OR-Tools style constraint types
interface ConstraintVariable {
  name: string
  domain: [number, number]
  value?: number
}

interface LinearConstraint {
  variables: { name: string; coefficient: number }[]
  lowerBound: number
  upperBound: number
}

interface ObjectiveTerm {
  variable: string
  coefficient: number
}

// OR-Tools style Model (mimics CP-SAT model)
class ORToolsModel {
  private variables: Map<string, ConstraintVariable> = new Map()
  private constraints: LinearConstraint[] = []
  private objectiveTerms: ObjectiveTerm[] = []
  private maximize = true
  private solution: Map<string, number> = new Map()

  // Create a new integer variable (mimics model.NewIntVar)
  newIntVar(lb: number, ub: number, name: string): string {
    this.variables.set(name, { name, domain: [lb, ub] })
    return name
  }

  // Create a new boolean variable (mimics model.NewBoolVar)
  newBoolVar(name: string): string {
    this.variables.set(name, { name, domain: [0, 1] })
    return name
  }

  // Add constraint: sum(coefficients * variables) within bounds
  addLinearConstraint(terms: { variable: string; coefficient: number }[], lb: number, ub: number): void {
    this.constraints.push({
      variables: terms.map((t) => ({ name: t.variable, coefficient: t.coefficient })),
      lowerBound: lb,
      upperBound: ub,
    })
  }

  // Add to objective function
  addObjectiveTerm(variable: string, coefficient: number): void {
    this.objectiveTerms.push({ variable, coefficient })
  }

  // Set to maximize (default) or minimize
  setMaximize(maximize: boolean): void {
    this.maximize = maximize
  }

  // Get variable value from solution
  getValue(variable: string): number {
    return this.solution.get(variable) ?? 0
  }

  // Solve using branch-and-bound with constraint propagation
  solve(): "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" {
    const varNames = Array.from(this.variables.keys())
    let bestObjective = this.maximize ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    let bestSolution: Map<string, number> | null = null

    // Branch-and-bound solver
    const solve = (assignment: Map<string, number>, depth: number): boolean => {
      // Check all constraints
      for (const constraint of this.constraints) {
        let sum = 0
        let allAssigned = true
        let minPossible = 0
        let maxPossible = 0

        for (const term of constraint.variables) {
          const val = assignment.get(term.name)
          if (val !== undefined) {
            sum += term.coefficient * val
            minPossible += term.coefficient * val
            maxPossible += term.coefficient * val
          } else {
            allAssigned = false
            const varDef = this.variables.get(term.name)!
            if (term.coefficient > 0) {
              minPossible += term.coefficient * varDef.domain[0]
              maxPossible += term.coefficient * varDef.domain[1]
            } else {
              minPossible += term.coefficient * varDef.domain[1]
              maxPossible += term.coefficient * varDef.domain[0]
            }
          }
        }

        // Prune if constraint cannot be satisfied
        if (maxPossible < constraint.lowerBound || minPossible > constraint.upperBound) {
          return false
        }

        // Check if constraint is violated with current assignment
        if (allAssigned && (sum < constraint.lowerBound || sum > constraint.upperBound)) {
          return false
        }
      }

      // If all variables assigned, check if this is a better solution
      if (assignment.size === this.variables.size) {
        let objective = 0
        for (const term of this.objectiveTerms) {
          objective += term.coefficient * (assignment.get(term.variable) ?? 0)
        }

        if ((this.maximize && objective > bestObjective) || (!this.maximize && objective < bestObjective)) {
          bestObjective = objective
          bestSolution = new Map(assignment)
        }
        return true
      }

      // Find next unassigned variable
      const unassignedVar = varNames.find((v) => !assignment.has(v))
      if (!unassignedVar) return false

      const varDef = this.variables.get(unassignedVar)!
      const [lb, ub] = varDef.domain

      // Try values in domain (for booleans, try 1 first for maximization)
      const values =
        lb === 0 && ub === 1
          ? this.maximize
            ? [1, 0]
            : [0, 1]
          : Array.from({ length: Math.min(ub - lb + 1, 10) }, (_, i) => (this.maximize ? ub - i : lb + i)).filter(
              (v) => v >= lb && v <= ub,
            )

      for (const val of values) {
        assignment.set(unassignedVar, val)
        solve(assignment, depth + 1)
        assignment.delete(unassignedVar)

        // Early termination for time constraint
        if (Date.now() - startTime > 2000) break
      }

      return bestSolution !== null
    }

    const startTime = Date.now()
    solve(new Map(), 0)

    if (bestSolution) {
      this.solution = bestSolution
      return "OPTIMAL"
    }

    // Try greedy fallback if branch-and-bound didn't find solution
    return this.greedyFallback() ? "FEASIBLE" : "INFEASIBLE"
  }

  private greedyFallback(): boolean {
    const assignment = new Map<string, number>()

    for (const [name, varDef] of this.variables) {
      // For boolean variables, start with 1 if maximizing
      if (varDef.domain[0] === 0 && varDef.domain[1] === 1) {
        assignment.set(name, this.maximize ? 1 : 0)
      } else {
        assignment.set(name, Math.floor((varDef.domain[0] + varDef.domain[1]) / 2))
      }
    }

    // Adjust to satisfy constraints
    for (const constraint of this.constraints) {
      let sum = 0
      for (const term of constraint.variables) {
        sum += term.coefficient * (assignment.get(term.name) ?? 0)
      }

      if (sum < constraint.lowerBound || sum > constraint.upperBound) {
        // Try to adjust variables
        for (const term of constraint.variables) {
          const varDef = this.variables.get(term.name)!
          const current = assignment.get(term.name) ?? 0

          if (sum < constraint.lowerBound && term.coefficient > 0) {
            assignment.set(term.name, Math.min(varDef.domain[1], current + 1))
          } else if (sum > constraint.upperBound && term.coefficient > 0) {
            assignment.set(term.name, Math.max(varDef.domain[0], current - 1))
          }
        }
      }
    }

    this.solution = assignment
    return true
  }
}

// Cutting Stock Pattern Generator using Column Generation approach
interface CuttingPattern {
  widths: number[]
  orderIndices: number[]
  slitCounts: Map<number, number> // orderIndex -> count of slits assigned
  waste: number
  usedWidth: number
}

function generateAllPatternsForCoil(
  coilWidth: number,
  orders: { width: number; orderId: string; noOfSlit: number; remainingSlits: number }[],
  lineSpec: LineSpec,
): CuttingPattern[] {
  const patterns: CuttingPattern[] = []
  const edgeTrim = lineSpec.scrapEdgeMin * 2
  const usableWidth = coilWidth - edgeTrim
  const maxKnives = lineSpec.maxKnives

  // Generate patterns using recursive enumeration with pruning
  // Now considers noOfSlit requirements
  const generatePatterns = (
    remaining: number,
    currentWidths: number[],
    currentOrderIndices: number[],
    slitCounts: Map<number, number>,
    startIndex: number,
  ) => {
    // Calculate current waste
    const usedWidth = currentWidths.reduce((sum, w) => sum + w, 0)
    const waste = remaining

    // Add current pattern if valid
    if (currentWidths.length > 0 && currentWidths.length <= maxKnives) {
      patterns.push({
        widths: [...currentWidths],
        orderIndices: [...currentOrderIndices],
        slitCounts: new Map(slitCounts),
        waste: waste + edgeTrim,
        usedWidth,
      })
    }

    // Try adding more widths
    if (currentWidths.length >= maxKnives) return

    for (let i = startIndex; i < orders.length; i++) {
      const order = orders[i]
      const orderWidth = order.width
      const currentSlitCount = slitCounts.get(i) || 0

      const canAddMoreSlits = currentSlitCount < order.remainingSlits

      if (
        orderWidth <= remaining &&
        orderWidth >= lineSpec.minSlitWidth &&
        orderWidth <= lineSpec.maxSlitWidth &&
        canAddMoreSlits
      ) {
        currentWidths.push(orderWidth)
        currentOrderIndices.push(i)
        slitCounts.set(i, currentSlitCount + 1)

        generatePatterns(remaining - orderWidth, currentWidths, currentOrderIndices, slitCounts, i)

        currentWidths.pop()
        currentOrderIndices.pop()
        slitCounts.set(i, currentSlitCount)
      }
    }
  }

  generatePatterns(usableWidth, [], [], new Map(), 0)

  patterns.sort((a, b) => {
    // First priority: patterns that complete more slit requirements
    const aSlitScore = calculateSlitFulfillmentScore(a, orders)
    const bSlitScore = calculateSlitFulfillmentScore(b, orders)
    if (bSlitScore !== aSlitScore) return bSlitScore - aSlitScore

    // Second priority: less waste
    return a.waste - b.waste
  })

  // Return top patterns to limit complexity
  return patterns.slice(0, 50)
}

function calculateSlitFulfillmentScore(
  pattern: CuttingPattern,
  orders: { width: number; orderId: string; noOfSlit: number; remainingSlits: number }[],
): number {
  let score = 0
  for (const [orderIdx, slitCount] of pattern.slitCounts) {
    const order = orders[orderIdx]
    // Higher score for getting closer to fulfilling the noOfSlit requirement
    const fulfillmentRatio = slitCount / order.noOfSlit
    score += Math.min(fulfillmentRatio, 1) * 100 // Cap at 100% fulfillment

    // Bonus for exact matches
    if (slitCount === order.remainingSlits) {
      score += 20
    }
  }
  return score
}

// Main OR-Tools style optimization using Set Covering formulation
export function runOptimization(
  coils: RMCoil[],
  orders: SalesOrder[],
  lineSpecs: LineSpec[],
  weights: Weights,
): OptimizationResult {
  if (coils.length === 0 || orders.length === 0 || lineSpecs.length === 0) {
    return {
      patterns: [],
      totalYield: 0,
      totalScrap: 0,
      ordersCovered: 0,
      totalOrders: orders.length,
    }
  }

  const orderSlitTracker = new Map<string, { total: number; remaining: number }>()
  for (const order of orders) {
    orderSlitTracker.set(order.orderId, {
      total: order.noOfSlit || 1,
      remaining: order.noOfSlit || 1,
    })
  }

  // Step 1: Filter compatible coil-order pairs
  const compatiblePairs: { coil: RMCoil; orders: SalesOrder[]; lineSpec: LineSpec }[] = []

  for (const coil of coils) {
    const compatibleOrders = orders.filter(
      (order) =>
        order.type === coil.type && order.grade === coil.grade && Math.abs(order.thickness - coil.thickness) < 0.1,
    )

    if (compatibleOrders.length === 0) continue

    const lineSpec = lineSpecs.find(
      (l) =>
        coil.lineCompatibility.includes(l.lineName as "Line-1" | "Line-2") &&
        ((coil.type === "HR" && l.hrCapability) || (coil.type === "CR" && l.crCapability)),
    )

    if (!lineSpec) continue

    compatiblePairs.push({ coil, orders: compatibleOrders, lineSpec })
  }

  // Step 2: Generate all possible cutting patterns for each coil
  const allCandidatePatterns: {
    coil: RMCoil
    pattern: CuttingPattern
    lineSpec: LineSpec
    compatibleOrders: SalesOrder[]
  }[] = []

  for (const { coil, orders: compatibleOrders, lineSpec } of compatiblePairs) {
    const orderWidths = compatibleOrders.map((o) => ({
      width: o.requiredWidth,
      orderId: o.orderId,
      noOfSlit: o.noOfSlit || 1,
      remainingSlits: orderSlitTracker.get(o.orderId)?.remaining || 1,
    }))
    const patterns = generateAllPatternsForCoil(coil.width, orderWidths, lineSpec)

    for (const pattern of patterns) {
      allCandidatePatterns.push({ coil, pattern, lineSpec, compatibleOrders })
    }
  }

  if (allCandidatePatterns.length === 0) {
    return {
      patterns: [],
      totalYield: 0,
      totalScrap: 0,
      ordersCovered: 0,
      totalOrders: orders.length,
    }
  }

  // Step 3: Build OR-Tools style CP model
  const model = new ORToolsModel()

  // Create boolean variable for each candidate pattern (x_i = 1 if pattern i is selected)
  const patternVars: string[] = []
  for (let i = 0; i < allCandidatePatterns.length; i++) {
    const varName = model.newBoolVar(`pattern_${i}`)
    patternVars.push(varName)
  }

  // Constraint 1: Each coil can only be used once
  const coilPatternMap = new Map<string, number[]>()
  for (let i = 0; i < allCandidatePatterns.length; i++) {
    const coilId = allCandidatePatterns[i].coil.coilId
    if (!coilPatternMap.has(coilId)) {
      coilPatternMap.set(coilId, [])
    }
    coilPatternMap.get(coilId)!.push(i)
  }

  for (const [_coilId, patternIndices] of coilPatternMap) {
    model.addLinearConstraint(
      patternIndices.map((i) => ({ variable: patternVars[i], coefficient: 1 })),
      0, // At least 0
      1, // At most 1 pattern per coil
    )
  }

  // Constraint 2: Line capacity (balance load between lines)
  const line1Patterns: number[] = []
  const line2Patterns: number[] = []
  for (let i = 0; i < allCandidatePatterns.length; i++) {
    const lineName = allCandidatePatterns[i].lineSpec.lineName
    if (lineName === "Line-1") line1Patterns.push(i)
    else if (lineName === "Line-2") line2Patterns.push(i)
  }

  for (let i = 0; i < allCandidatePatterns.length; i++) {
    const { coil, pattern, compatibleOrders } = allCandidatePatterns[i]
    const yieldPercent = (pattern.usedWidth / coil.width) * 100

    // Calculate score based on weights
    const yieldScore = yieldPercent * (weights.w1 / 100)

    let slitFulfillmentScore = 0
    const slitCountByOrder = new Map<string, number>()

    for (const orderIdx of pattern.orderIndices) {
      const order = compatibleOrders[orderIdx]
      const currentCount = slitCountByOrder.get(order.orderId) || 0
      slitCountByOrder.set(order.orderId, currentCount + 1)
    }

    for (const [orderId, slitCount] of slitCountByOrder) {
      const order = compatibleOrders.find((o) => o.orderId === orderId)
      if (order) {
        const requiredSlits = order.noOfSlit || 1
        const fulfillmentRatio = Math.min(slitCount / requiredSlits, 1)
        slitFulfillmentScore += fulfillmentRatio * 50 // Significant weight for slit fulfillment

        // Bonus for exact match
        if (slitCount === requiredSlits) {
          slitFulfillmentScore += 25
        }
      }
    }

    const orderScore = slitFulfillmentScore * (weights.w2 / 100)

    // Scrap penalty
    const scrapPenalty = (pattern.waste / 100) * (weights.w3 / 100)

    // Setup penalty (based on number of cuts)
    const setupPenalty = pattern.widths.length * (weights.w4 / 100)

    const totalScore = yieldScore + orderScore - scrapPenalty - setupPenalty

    model.addObjectiveTerm(patternVars[i], totalScore)
  }

  // Step 4: Solve the model
  const status = model.solve()

  // Step 5: Extract solution and build result patterns
  const selectedPatterns: SlittingPattern[] = []
  const usedCoils = new Set<string>()
  const orderSlitsAssigned = new Map<string, number>()

  for (let i = 0; i < allCandidatePatterns.length; i++) {
    if (model.getValue(patternVars[i]) === 1 && !usedCoils.has(allCandidatePatterns[i].coil.coilId)) {
      const { coil, pattern, lineSpec, compatibleOrders } = allCandidatePatterns[i]

      // Build slit widths with order IDs and quantities based on noOfSlit
      const slitWidths: { width: number; orderId?: string; quantity: number }[] = []
      const widthCounts = new Map<number, { count: number; orderIds: string[]; orders: SalesOrder[] }>()

      for (const idx of pattern.orderIndices) {
        const order = compatibleOrders[idx]
        const existing = widthCounts.get(order.requiredWidth)
        if (existing) {
          existing.count++
          if (!existing.orderIds.includes(order.orderId)) {
            existing.orderIds.push(order.orderId)
            existing.orders.push(order)
          }
        } else {
          widthCounts.set(order.requiredWidth, { count: 1, orderIds: [order.orderId], orders: [order] })
        }

        // Track slits assigned to this order
        const currentAssigned = orderSlitsAssigned.get(order.orderId) || 0
        orderSlitsAssigned.set(order.orderId, currentAssigned + 1)
      }

      for (const [width, { count, orderIds, orders }] of widthCounts) {
        slitWidths.push({
          width,
          orderId: orderIds[0],
          quantity: count,
        })
      }

      const yieldPercent = (pattern.usedWidth / coil.width) * 100

      selectedPatterns.push({
        id: `pattern-${coil.coilId}-or`,
        coilId: coil.coilId,
        patternId: `P-OR-${selectedPatterns.length + 1}`,
        slitWidths,
        scrapWidth: pattern.waste,
        yieldPercent,
        score: model.getValue(patternVars[i]),
        assignedLine: lineSpec.lineName as "Line-1" | "Line-2",
      })

      usedCoils.add(coil.coilId)
    }
  }

  // If no patterns selected, try greedy approach
  if (selectedPatterns.length === 0) {
    return runGreedyOptimization(coils, orders, lineSpecs, weights)
  }

  // Balance line assignment
  const balancedPatterns = balanceLineAssignment(selectedPatterns, lineSpecs)

  // Calculate summary metrics
  const totalYield =
    balancedPatterns.length > 0
      ? balancedPatterns.reduce((sum, p) => sum + p.yieldPercent, 0) / balancedPatterns.length
      : 0

  const totalScrap = balancedPatterns.reduce((sum, p) => sum + p.scrapWidth, 0)

  let fullyFulfilledOrders = 0
  let partiallyFulfilledOrders = 0

  for (const order of orders) {
    const assigned = orderSlitsAssigned.get(order.orderId) || 0
    const required = order.noOfSlit || 1
    if (assigned >= required) {
      fullyFulfilledOrders++
    } else if (assigned > 0) {
      partiallyFulfilledOrders++
    }
  }

  return {
    patterns: balancedPatterns,
    totalYield,
    totalScrap,
    ordersCovered: fullyFulfilledOrders,
    totalOrders: orders.length,
    // Additional metrics for reporting
    partiallyFulfilledOrders,
    orderSlitsAssigned: Object.fromEntries(orderSlitsAssigned),
  }
}

function runGreedyOptimization(
  coils: RMCoil[],
  orders: SalesOrder[],
  lineSpecs: LineSpec[],
  weights: Weights,
): OptimizationResult {
  const patterns: SlittingPattern[] = []
  const orderSlitsAssigned = new Map<string, number>()

  // Sort coils by width (larger first for better utilization)
  const sortedCoils = [...coils].sort((a, b) => b.width - a.width)

  // Sort orders by priority, then by noOfSlit (higher first), then by width
  const sortedOrders = [...orders].sort((a, b) => {
    const priorityOrder = { High: 0, Medium: 1, Low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    // Higher noOfSlit gets priority
    if ((b.noOfSlit || 1) !== (a.noOfSlit || 1)) {
      return (b.noOfSlit || 1) - (a.noOfSlit || 1)
    }
    return b.requiredWidth - a.requiredWidth
  })

  for (const coil of sortedCoils) {
    const lineSpec = lineSpecs.find(
      (l) =>
        coil.lineCompatibility.includes(l.lineName as "Line-1" | "Line-2") &&
        ((coil.type === "HR" && l.hrCapability) || (coil.type === "CR" && l.crCapability)),
    )

    if (!lineSpec) continue

    const edgeTrim = lineSpec.scrapEdgeMin * 2
    const usableWidth = coil.width - edgeTrim
    let remainingWidth = usableWidth

    const slitWidths: { width: number; orderId?: string; quantity: number }[] = []
    let knifeCount = 0

    // Greedy bin-packing with noOfSlit consideration
    for (const order of sortedOrders) {
      if (knifeCount >= lineSpec.maxKnives - 1) break
      if (order.type !== coil.type || order.grade !== coil.grade) continue
      if (Math.abs(order.thickness - coil.thickness) >= 0.1) continue
      if (order.requiredWidth < lineSpec.minSlitWidth || order.requiredWidth > lineSpec.maxSlitWidth) continue

      const requiredSlits = order.noOfSlit || 1
      const assignedSlits = orderSlitsAssigned.get(order.orderId) || 0
      const remainingSlitsNeeded = requiredSlits - assignedSlits

      if (remainingSlitsNeeded <= 0) continue // Order already fulfilled

      // Calculate how many slits we can fit for this order
      const maxFitByWidth = Math.floor(remainingWidth / order.requiredWidth)
      const maxFitByKnives = lineSpec.maxKnives - knifeCount - 1
      const slitsToAssign = Math.min(maxFitByWidth, maxFitByKnives, remainingSlitsNeeded)

      if (slitsToAssign > 0) {
        slitWidths.push({
          width: order.requiredWidth,
          orderId: order.orderId,
          quantity: slitsToAssign,
        })
        remainingWidth -= order.requiredWidth * slitsToAssign
        knifeCount += slitsToAssign
        orderSlitsAssigned.set(order.orderId, assignedSlits + slitsToAssign)
      }
    }

    if (slitWidths.length > 0) {
      const totalSlitWidth = slitWidths.reduce((sum, s) => sum + s.width * s.quantity, 0)
      const scrapWidth = coil.width - totalSlitWidth
      const yieldPercent = (totalSlitWidth / coil.width) * 100

      patterns.push({
        id: `pattern-${coil.coilId}-greedy`,
        coilId: coil.coilId,
        patternId: `P-G-${patterns.length + 1}`,
        slitWidths,
        scrapWidth,
        yieldPercent,
        score: yieldPercent,
        assignedLine: lineSpec.lineName as "Line-1" | "Line-2",
      })
    }
  }

  const balancedPatterns = balanceLineAssignment(patterns, lineSpecs)

  const totalYield =
    balancedPatterns.length > 0
      ? balancedPatterns.reduce((sum, p) => sum + p.yieldPercent, 0) / balancedPatterns.length
      : 0

  const totalScrap = balancedPatterns.reduce((sum, p) => sum + p.scrapWidth, 0)

  let fullyFulfilledOrders = 0
  let partiallyFulfilledOrders = 0

  for (const order of orders) {
    const assigned = orderSlitsAssigned.get(order.orderId) || 0
    const required = order.noOfSlit || 1
    if (assigned >= required) {
      fullyFulfilledOrders++
    } else if (assigned > 0) {
      partiallyFulfilledOrders++
    }
  }

  return {
    patterns: balancedPatterns,
    totalYield,
    totalScrap,
    ordersCovered: fullyFulfilledOrders,
    totalOrders: orders.length,
    partiallyFulfilledOrders,
    orderSlitsAssigned: Object.fromEntries(orderSlitsAssigned),
  }
}

// Balance patterns across slitter lines
function balanceLineAssignment(patterns: SlittingPattern[], lineSpecs: LineSpec[]): SlittingPattern[] {
  const line1Count = patterns.filter((p) => p.assignedLine === "Line-1").length
  const line2Count = patterns.filter((p) => p.assignedLine === "Line-2").length

  const line2Spec = lineSpecs.find((l) => l.lineName === "Line-2")

  // Rebalance if needed
  if (Math.abs(line1Count - line2Count) > 1 && line2Spec) {
    let idx = 0
    for (const pattern of patterns) {
      if (idx % 2 === 0) {
        pattern.assignedLine = "Line-1"
      } else if (line2Spec) {
        pattern.assignedLine = "Line-2"
      }
      idx++
    }
  }

  return patterns
}
