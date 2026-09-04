import { Grid, GridItem, useBreakpointValue } from '@chakra-ui/react'
import { CanvasWorkspace } from '@/features/editor/canvas/CanvasWorkspace'
import { EditorViewTransitionLanding } from '@/features/editor/EditorViewTransitionLanding'
import { GlyphInsightProvider } from '@/features/editor/insight/GlyphInsightProvider'
import { LeftPanel } from '@/features/editor/leftPanel/LeftPanel'
import { EditorRightPanel } from '@/features/editor/rightPanel/EditorRightPanel'

export function EditorLayout() {
  const isDesktop = useBreakpointValue({ base: false, lg: true })

  return (
    <GlyphInsightProvider>
      <Grid
        templateColumns={isDesktop ? '300px minmax(0, 1fr) 320px' : '1fr'}
        templateRows={
          isDesktop ? '1fr' : 'minmax(280px, 36vh) minmax(420px, 1fr) auto'
        }
        templateAreas={
          isDesktop
            ? `"left canvas right"`
            : `"left"
             "canvas"
             "right"`
        }
        h="100vh"
        w="100vw"
        overflow="hidden"
        bg="foreground"
      >
        <GridItem area="left" minW={0} minH={0}>
          <LeftPanel />
        </GridItem>
        <GridItem area="canvas" minW={0} minH={0}>
          <CanvasWorkspace />
        </GridItem>
        <GridItem area="right" minW={0} minH={0}>
          <EditorRightPanel />
        </GridItem>
      </Grid>
      <EditorViewTransitionLanding />
    </GlyphInsightProvider>
  )
}
