import { Box, Tab, TabList } from '@chakra-ui/react'
import { LayoutGroup, motion } from 'framer-motion'
import type { ReactNode } from 'react'

const tabHighlightTransition = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.8,
} as const

interface SlidingTabProps {
  children: ReactNode
  isSelected: boolean
  layoutId: string
}

function SlidingTab({ children, isSelected, layoutId }: SlidingTabProps) {
  return (
    <Tab
      flexShrink={0}
      position="relative"
      overflow="visible"
      bg="transparent"
      color={isSelected ? 'field.yellow.300' : 'field.ink'}
      _hover={{
        bg: 'transparent',
        color: isSelected ? 'field.yellow.300' : 'field.ink',
      }}
      _selected={{
        bg: 'transparent',
        color: 'field.yellow.300',
      }}
    >
      {isSelected ? (
        <motion.span
          layoutId={layoutId}
          transition={tabHighlightTransition}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 9999,
            background: 'var(--chakra-colors-field-ink)',
          }}
        />
      ) : null}
      <Box as="span" position="relative" zIndex={1}>
        {children}
      </Box>
    </Tab>
  )
}

interface SlidingTabListProps {
  activeIndex: number
  labels: ReactNode[]
  layoutGroupId: string
}

export function SlidingTabList({
  activeIndex,
  labels,
  layoutGroupId,
}: SlidingTabListProps) {
  return (
    <LayoutGroup id={layoutGroupId}>
      <TabList
        overflowX="auto"
        overflowY="hidden"
        maxW="100%"
        bg="field.panelMuted"
        borderRadius="full"
        p={1}
      >
        {labels.map((label, index) => (
          <SlidingTab
            key={`${layoutGroupId}-${index}`}
            isSelected={activeIndex === index}
            layoutId={`${layoutGroupId}-active-tab`}
          >
            {label}
          </SlidingTab>
        ))}
      </TabList>
    </LayoutGroup>
  )
}
