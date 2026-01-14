"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import {
  Cpu,
  Play,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  FileText,
  Settings2,
  Layers,
  TrendingUp,
  Package,
  Scissors,
  Factory,
} from "lucide-react"
import { useSlitter } from "@/lib/slitter-context"
import { runOptimization } from "@/lib/optimizer"
import { CoilSlittingVisualization } from "@/components/visualizations/coil-slitting-viz"
import { YieldScrapChart } from "@/components/visualizations/yield-scrap-chart"
import { OrderFulfilmentDashboard } from "@/components/visualizations/order-fulfilment"
import { SlitterLineLoadView } from "@/components/visualizations/line-load-view"

export function OptimizerTab() {
  const { coils, orders, lineSpecs, weights, setWeights, optimizationResult, setOptimizationResult } = useSlitter()
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [selectedType, setSelectedType] = useState<"HR" | "CR" | "all">("all")
  const [optimizationProgress, setOptimizationProgress] = useState(0)
  const [activeReportTab, setActiveReportTab] = useState("summary")

  const canOptimize = coils.length > 0 && orders.length > 0 && lineSpecs.length > 0

  const handleOptimize = async () => {
    setIsOptimizing(true)
    setOptimizationProgress(0)

    // Simulate progress for OR-Tools optimization stages
    const progressStages = [
      { progress: 10, delay: 200, label: "Filtering compatible pairs..." },
      { progress: 30, delay: 300, label: "Generating cutting patterns..." },
      { progress: 50, delay: 400, label: "Building constraint model..." },
      { progress: 70, delay: 500, label: "Running CP-SAT solver..." },
      { progress: 90, delay: 300, label: "Extracting solution..." },
      { progress: 100, delay: 200, label: "Complete" },
    ]

    for (const stage of progressStages) {
      await new Promise((resolve) => setTimeout(resolve, stage.delay))
      setOptimizationProgress(stage.progress)
    }

    const filteredCoils = selectedType === "all" ? coils : coils.filter((c) => c.type === selectedType)
    const filteredOrders = selectedType === "all" ? orders : orders.filter((o) => o.type === selectedType)

    const result = runOptimization(filteredCoils, filteredOrders, lineSpecs, weights)
    setOptimizationResult(result)
    setIsOptimizing(false)
  }

  // Calculate detailed metrics for reports
  const getDetailedMetrics = () => {
    if (!optimizationResult) return null

    const patterns = optimizationResult.patterns
    const line1Patterns = patterns.filter((p) => p.assignedLine === "Line-1")
    const line2Patterns = patterns.filter((p) => p.assignedLine === "Line-2")

    // Calculate total weights
    const totalCoilWeight = coils.reduce((sum, c) => sum + c.weight, 0)
    const usedCoilWeight = patterns.reduce((sum, p) => {
      const coil = coils.find((c) => c.coilId === p.coilId)
      return sum + (coil?.weight || 0)
    }, 0)
    const yieldWeight = usedCoilWeight * (optimizationResult.totalYield / 100)
    const scrapWeight = usedCoilWeight - yieldWeight

    // Order metrics
    const totalOrderWeight = orders.reduce((sum, o) => sum + o.weight, 0)
    const coveredOrderIds = new Set<string>()
    for (const pattern of patterns) {
      for (const slit of pattern.slitWidths) {
        if (slit.orderId) coveredOrderIds.add(slit.orderId)
      }
    }
    const fulfilledWeight = orders.filter((o) => coveredOrderIds.has(o.orderId)).reduce((sum, o) => sum + o.weight, 0)

    // Priority breakdown
    const highPriorityOrders = orders.filter((o) => o.priority === "High")
    const highPriorityFulfilled = highPriorityOrders.filter((o) => coveredOrderIds.has(o.orderId))

    return {
      coilUtilization: {
        total: coils.length,
        used: patterns.length,
        utilizationPercent: (patterns.length / coils.length) * 100,
      },
      weightMetrics: {
        totalCoilWeight,
        usedCoilWeight,
        yieldWeight,
        scrapWeight,
        totalOrderWeight,
        fulfilledWeight,
      },
      lineMetrics: {
        line1: {
          patterns: line1Patterns.length,
          avgYield:
            line1Patterns.length > 0
              ? line1Patterns.reduce((sum, p) => sum + p.yieldPercent, 0) / line1Patterns.length
              : 0,
          totalScrap: line1Patterns.reduce((sum, p) => sum + p.scrapWidth, 0),
        },
        line2: {
          patterns: line2Patterns.length,
          avgYield:
            line2Patterns.length > 0
              ? line2Patterns.reduce((sum, p) => sum + p.yieldPercent, 0) / line2Patterns.length
              : 0,
          totalScrap: line2Patterns.reduce((sum, p) => sum + p.scrapWidth, 0),
        },
      },
      priorityMetrics: {
        highPriorityTotal: highPriorityOrders.length,
        highPriorityFulfilled: highPriorityFulfilled.length,
        highPriorityPercent:
          highPriorityOrders.length > 0 ? (highPriorityFulfilled.length / highPriorityOrders.length) * 100 : 100,
      },
    }
  }

  const metrics = optimizationResult ? getDetailedMetrics() : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            Google OR-Tools Optimizer
          </h2>
          <p className="text-muted-foreground">Constraint Programming based slitting optimization</p>
        </div>
        <Badge variant="outline" className="text-xs">
          CP-SAT Solver
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>OR-Tools optimization parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Material Type Filter</Label>
              <Select value={selectedType} onValueChange={(v: "HR" | "CR" | "all") => setSelectedType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="HR">HR (Hot Rolled)</SelectItem>
                  <SelectItem value="CR">CR (Cold Rolled)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium">Objective Weights</Label>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Yield Maximization
                    </span>
                    <span className="text-muted-foreground font-mono">{weights.w1}%</span>
                  </div>
                  <Slider
                    value={[weights.w1]}
                    onValueChange={([v]) => setWeights({ ...weights, w1: v })}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" /> Order Coverage
                    </span>
                    <span className="text-muted-foreground font-mono">{weights.w2}%</span>
                  </div>
                  <Slider
                    value={[weights.w2]}
                    onValueChange={([v]) => setWeights({ ...weights, w2: v })}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Scissors className="h-3 w-3" /> Scrap Penalty
                    </span>
                    <span className="text-muted-foreground font-mono">{weights.w3}%</span>
                  </div>
                  <Slider
                    value={[weights.w3]}
                    onValueChange={([v]) => setWeights({ ...weights, w3: v })}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Factory className="h-3 w-3" /> Setup Penalty
                    </span>
                    <span className="text-muted-foreground font-mono">{weights.w4}%</span>
                  </div>
                  <Slider
                    value={[weights.w4]}
                    onValueChange={([v]) => setWeights({ ...weights, w4: v })}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
            </div>

            {/* Solver Info */}
            <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Solver Configuration</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Algorithm:</span>
                <span className="font-mono">CP-SAT</span>
                <span>Model:</span>
                <span className="font-mono">Set Covering</span>
                <span>Patterns:</span>
                <span className="font-mono">Column Gen</span>
              </div>
            </div>

            {!canOptimize && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Missing Data</AlertTitle>
                <AlertDescription>Add coils, orders, and line specs before optimizing.</AlertDescription>
              </Alert>
            )}

            {isOptimizing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Optimization Progress</span>
                  <span>{optimizationProgress}%</span>
                </div>
                <Progress value={optimizationProgress} className="h-2" />
              </div>
            )}

            <Button className="w-full" size="lg" onClick={handleOptimize} disabled={!canOptimize || isOptimizing}>
              {isOptimizing ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Running OR-Tools...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Optimization
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Optimization Results
            </CardTitle>
            <CardDescription>
              {optimizationResult
                ? `OR-Tools generated ${optimizationResult.patterns.length} optimal patterns`
                : "Run optimization to see results"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {optimizationResult ? (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Total Yield</p>
                    <p className="text-2xl font-bold text-primary">{optimizationResult.totalYield.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-4 border border-destructive/20">
                    <p className="text-sm text-muted-foreground">Total Scrap</p>
                    <p className="text-2xl font-bold text-destructive">{optimizationResult.totalScrap.toFixed(0)} MM</p>
                  </div>
                  <div className="rounded-lg bg-chart-2/10 p-4 border border-chart-2/20">
                    <p className="text-sm text-muted-foreground">Orders Covered</p>
                    <p className="text-2xl font-bold text-chart-2">
                      {optimizationResult.ordersCovered}/{optimizationResult.totalOrders}
                    </p>
                  </div>
                  <div className="rounded-lg bg-chart-4/10 p-4 border border-chart-4/20">
                    <p className="text-sm text-muted-foreground">Patterns</p>
                    <p className="text-2xl font-bold text-chart-4">{optimizationResult.patterns.length}</p>
                  </div>
                </div>

                {/* Report Tabs */}
                <Tabs value={activeReportTab} onValueChange={setActiveReportTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="summary" className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Summary
                    </TabsTrigger>
                    <TabsTrigger value="patterns" className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      Patterns
                    </TabsTrigger>
                    <TabsTrigger value="orders" className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Orders
                    </TabsTrigger>
                    <TabsTrigger value="lines" className="flex items-center gap-1">
                      <Factory className="h-3 w-3" />
                      Lines
                    </TabsTrigger>
                  </TabsList>

                  {/* Summary Report */}
                  <TabsContent value="summary" className="mt-4">
                    {metrics && (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="font-semibold flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-primary" />
                              Coil Utilization
                            </h4>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Total Coils</span>
                                <span className="font-mono">{metrics.coilUtilization.total}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Coils Used</span>
                                <span className="font-mono">{metrics.coilUtilization.used}</span>
                              </div>
                              <Progress value={metrics.coilUtilization.utilizationPercent} className="h-2" />
                              <p className="text-xs text-muted-foreground text-right">
                                {metrics.coilUtilization.utilizationPercent.toFixed(1)}% utilization
                              </p>
                            </div>
                          </div>

                          <div className="rounded-lg border p-4 space-y-3">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Package className="h-4 w-4 text-chart-2" />
                              Weight Analysis (MT)
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span>Used Coil Weight</span>
                                <span className="font-mono">{metrics.weightMetrics.usedCoilWeight.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-primary">
                                <span>Yield Weight</span>
                                <span className="font-mono">{metrics.weightMetrics.yieldWeight.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-destructive">
                                <span>Scrap Weight</span>
                                <span className="font-mono">{metrics.weightMetrics.scrapWeight.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-chart-3" />
                            Priority Order Fulfillment
                          </h4>
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <Progress value={metrics.priorityMetrics.highPriorityPercent} className="h-3" />
                            </div>
                            <div className="text-sm font-mono">
                              {metrics.priorityMetrics.highPriorityFulfilled}/
                              {metrics.priorityMetrics.highPriorityTotal} High Priority
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* Patterns Report */}
                  <TabsContent value="patterns" className="mt-4">
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pattern ID</TableHead>
                            <TableHead>Coil ID</TableHead>
                            <TableHead>Line</TableHead>
                            <TableHead className="text-right">Yield %</TableHead>
                            <TableHead className="text-right">Scrap (MM)</TableHead>
                            <TableHead className="text-right">Cuts</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {optimizationResult.patterns.map((pattern) => (
                            <TableRow key={pattern.id}>
                              <TableCell className="font-mono text-xs">{pattern.patternId}</TableCell>
                              <TableCell className="font-medium">{pattern.coilId}</TableCell>
                              <TableCell>
                                <Badge variant={pattern.assignedLine === "Line-1" ? "default" : "secondary"}>
                                  {pattern.assignedLine}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-primary">
                                {pattern.yieldPercent.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-mono text-destructive">
                                {pattern.scrapWidth.toFixed(0)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {pattern.slitWidths.reduce((sum, s) => sum + s.quantity, 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* Orders Report */}
                  <TabsContent value="orders" className="mt-4">
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Width (MM)</TableHead>
                            <TableHead>Weight (MT)</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map((order) => {
                            const isCovered = optimizationResult.patterns.some((p) =>
                              p.slitWidths.some((s) => s.orderId === order.orderId),
                            )
                            return (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.orderId}</TableCell>
                                <TableCell className="font-mono">{order.requiredWidth}</TableCell>
                                <TableCell className="font-mono">{order.weight}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      order.priority === "High"
                                        ? "destructive"
                                        : order.priority === "Medium"
                                          ? "default"
                                          : "secondary"
                                    }
                                  >
                                    {order.priority}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {isCovered ? (
                                    <Badge variant="outline" className="text-primary border-primary">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Fulfilled
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      Pending
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  {/* Lines Report */}
                  <TabsContent value="lines" className="mt-4">
                    {metrics && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">Line-1</h4>
                            <Badge>Primary</Badge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Patterns Assigned</span>
                              <span className="font-mono">{metrics.lineMetrics.line1.patterns}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Average Yield</span>
                              <span className="font-mono text-primary">
                                {metrics.lineMetrics.line1.avgYield.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Scrap</span>
                              <span className="font-mono text-destructive">
                                {metrics.lineMetrics.line1.totalScrap.toFixed(0)} MM
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">Line-2</h4>
                            <Badge variant="secondary">Secondary</Badge>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>Patterns Assigned</span>
                              <span className="font-mono">{metrics.lineMetrics.line2.patterns}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Average Yield</span>
                              <span className="font-mono text-primary">
                                {metrics.lineMetrics.line2.avgYield.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Scrap</span>
                              <span className="font-mono text-destructive">
                                {metrics.lineMetrics.line2.totalScrap.toFixed(0)} MM
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Accept Button */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button className="flex-1 bg-transparent" variant="outline">
                    Export Report
                  </Button>
                  <Button className="flex-1">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Accept & Release to Shop Floor
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Cpu className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-medium">No optimization results yet</h3>
                <p className="text-sm text-muted-foreground">
                  Configure parameters and click &quot;Run Optimization&quot; to use OR-Tools solver
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visualizations */}
      {optimizationResult && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold">Visualizations</h3>

          <div className="grid gap-6 lg:grid-cols-2">
            <CoilSlittingVisualization patterns={optimizationResult.patterns} coils={coils} />
            <YieldScrapChart patterns={optimizationResult.patterns} coils={coils} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <OrderFulfilmentDashboard
              patterns={optimizationResult.patterns}
              orders={orders}
              ordersCovered={optimizationResult.ordersCovered}
              totalOrders={optimizationResult.totalOrders}
            />
            <SlitterLineLoadView patterns={optimizationResult.patterns} lineSpecs={lineSpecs} />
          </div>
        </div>
      )}
    </div>
  )
}
