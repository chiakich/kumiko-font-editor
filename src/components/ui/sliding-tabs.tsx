import { Box, Tabs } from '@chakra-ui/react'
import { LayoutGroup, motion } from 'framer-motion'
import type { ComponentProps, ReactNode } from 'react'

const tabHighlightTransition = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.8,
} as const

type SlidingTabsRootProps = ComponentProps<typeof Tabs.Root>
type SlidingTabsContentGroupProps = ComponentProps<typeof Tabs.ContentGroup>
type SlidingTabsListProps = Omit<ComponentProps<typeof Tabs.List>, 'children'>

interface SlidingTabProps {
  children: ReactNode
  isSelected: boolean
  layoutId: string
  value: string
}

function SlidingTab({
  children,
  isSelected,
  layoutId,
  value,
}: SlidingTabProps) {
  return (
    <Tabs.Trigger
      value={value}
      alignItems="center"
      border={0}
      borderRadius="full"
      color={isSelected ? 'field.yellow.300' : 'field.ink'}
      cursor="pointer"
      display="inline-flex"
      flexShrink={0}
      fontWeight="900"
      h={8}
      justifyContent="center"
      lineHeight={1}
      minW={0}
      overflow="visible"
      px={4}
      position="relative"
      transition="color 160ms ease"
      whiteSpace="nowrap"
      _active={{
        bg: 'transparent',
      }}
      _focusVisible={{
        boxShadow: '0 0 0 2px var(--chakra-colors-field-cyan-400)',
      }}
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
      <Box
        as="span"
        alignItems="center"
        display="inline-flex"
        h="100%"
        justifyContent="center"
        lineHeight={1}
        position="relative"
        zIndex={1}
      >
        {children}
      </Box>
    </Tabs.Trigger>
  )
}

interface SlidingTabListProps extends SlidingTabsListProps {
  activeIndex: number
  labels: ReactNode[]
  layoutGroupId: string
}

export function SlidingTabsRoot({
  lazyMount = true,
  unstyled = true,
  ...props
}: SlidingTabsRootProps) {
  return <Tabs.Root lazyMount={lazyMount} unstyled={unstyled} {...props} />
}

export function SlidingTabsContentGroup({
  mt = 3,
  ...props
}: SlidingTabsContentGroupProps) {
  return <Tabs.ContentGroup mt={mt} {...props} />
}

export function SlidingTabList({
  activeIndex,
  labels,
  layoutGroupId,
  ...listProps
}: SlidingTabListProps) {
  return (
    <LayoutGroup id={layoutGroupId}>
      <Tabs.List
        alignItems="center"
        bg="field.panelMuted"
        borderRadius="full"
        display="inline-flex"
        gap={1}
        maxW="100%"
        minH={10}
        overflowX="auto"
        overflowY="hidden"
        p={1}
        {...listProps}
      >
        {labels.map((label, index) => (
          <SlidingTab
            key={`${layoutGroupId}-${index}`}
            isSelected={activeIndex === index}
            layoutId={`${layoutGroupId}-active-tab`}
            value={String(index)}
          >
            {label}
          </SlidingTab>
        ))}
      </Tabs.List>
    </LayoutGroup>
  )
}
