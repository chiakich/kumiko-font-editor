import { Dialog, HStack, Portal, Text } from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from '@/components/ui/sliding-tabs'
import type { ComponentProps, ReactNode } from 'react'

type DialogRootProps = Omit<
  ComponentProps<typeof Dialog.Root>,
  'children' | 'onOpenChange' | 'open'
>

interface TabbedModalProps extends DialogRootProps {
  activeTabIndex: number
  bodyProps?: ComponentProps<typeof Dialog.Body>
  children: ReactNode
  contentGroupProps?: ComponentProps<typeof SlidingTabsContentGroup>
  contentProps?: ComponentProps<typeof Dialog.Content>
  footer?: ReactNode
  footerProps?: ComponentProps<typeof Dialog.Footer>
  headerProps?: ComponentProps<typeof HStack>
  layoutGroupId: string
  onActiveTabIndexChange: (index: number) => void
  onClose: () => void
  open: boolean
  tabs: ReactNode[]
  title: ReactNode
}

export function TabbedModal({
  activeTabIndex,
  bodyProps,
  children,
  contentGroupProps,
  contentProps,
  footer,
  footerProps,
  headerProps,
  layoutGroupId,
  onActiveTabIndexChange,
  onClose,
  open,
  scrollBehavior = 'inside',
  size = 'xl',
  tabs,
  title,
  ...rootProps
}: TabbedModalProps) {
  return (
    <Dialog.Root
      open={open}
      scrollBehavior={scrollBehavior}
      size={size}
      onOpenChange={(details) => {
        if (!details.open) {
          onClose()
        }
      }}
      {...rootProps}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="lg" {...contentProps}>
            <DialogCloseButton zIndex={2} />
            <SlidingTabsRoot
              display="flex"
              flex={1}
              flexDirection="column"
              minH={0}
              size="sm"
              value={String(activeTabIndex)}
              onValueChange={(details) =>
                onActiveTabIndexChange(Number(details.value))
              }
            >
              <HStack
                align="center"
                gap={4}
                justify="space-between"
                pb={3}
                pr={12}
                pt={5}
                pl={6}
                {...headerProps}
              >
                <Text as="h2" fontSize="xl" fontWeight="900">
                  {title}
                </Text>
                <SlidingTabList
                  activeIndex={activeTabIndex}
                  labels={tabs}
                  layoutGroupId={layoutGroupId}
                />
              </HStack>

              <Dialog.Body flex={1} minH={0} pb={5} {...bodyProps}>
                <SlidingTabsContentGroup h="100%" mt={0} {...contentGroupProps}>
                  {children}
                </SlidingTabsContentGroup>
              </Dialog.Body>

              {footer ? (
                <Dialog.Footer gap={3} {...footerProps}>
                  {footer}
                </Dialog.Footer>
              ) : null}
            </SlidingTabsRoot>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
