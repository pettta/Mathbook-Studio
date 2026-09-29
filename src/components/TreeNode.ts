import { defineComponent, h, type PropType, type VNode } from 'vue'
// small recursive renderer
const TreeNode: ReturnType<typeof defineComponent> = defineComponent({
  name: 'TreeNode',
  props: {
    node: { type: Object as PropType<{ name: string; path: string; children?: any[]; binary?: boolean }>, required: true },
    depth: { type: Number, required: true },
    collapsed: { type: Object as PropType<Set<string>>, required: true },
    active: { type: String as PropType<string | null>, default: null },
    icon: { type: Function as PropType<(n: any) => string>, required: true },
  },
  emits: ['open', 'toggle', 'rename', 'delete'],
  setup(props, { emit }) {
    return (): VNode => {
      const n = props.node
      const isDir = !!n.children
      const row = h('div', {
        class: ['row', { active: props.active === n.path, dir: isDir }],
        style: { paddingLeft: 8 + props.depth * 14 + 'px' },
        onClick: () => (isDir ? emit('toggle', n.path) : emit('open', n.path)),
      }, [
        h('span', { class: 'ic' }, props.icon(n)),
        h('span', { class: 'nm' }, n.name),
        !isDir ? h('span', { class: 'row-actions' }, [
          h('button', { title: 'Rename', onClick: (e: Event) => { e.stopPropagation(); emit('rename', n) } }, '✎'),
          h('button', { title: 'Delete', onClick: (e: Event) => { e.stopPropagation(); emit('delete', n) } }, '🗑'),
        ]) : null,
      ])
      const kids: VNode[] = isDir && !props.collapsed.has(n.path)
        ? n.children!.map((c: any) => h(TreeNode, { key: c.path, node: c, depth: props.depth + 1, collapsed: props.collapsed, active: props.active, icon: props.icon,
          onOpen: (p: string) => emit('open', p), onToggle: (p: string) => emit('toggle', p), onRename: (x: any) => emit('rename', x), onDelete: (x: any) => emit('delete', x) }))
        : []
      return h('div', {}, [row, ...kids])
    }
  },
})
export default TreeNode
