package ecs

import (
	"context"
	"fmt"
	"net"
	"strconv"

	"github.com/coredns/coredns/plugin"
	"github.com/coredns/coredns/plugin/metadata"
	"github.com/coredns/coredns/request"

	"github.com/miekg/dns"
)

// Ecs is an example plugin to show how to write a plugin.
type Ecs struct {
	Next   plugin.Handler
	v4Mask net.IPMask
	v6Mask net.IPMask

	v4MaskSize uint8
	v6MaskSize uint8
}

// setupEdns0Opt will retrieve the EDNS0 OPT or create it if it does not exist.
func setupEdns0Opt(r *dns.Msg) *dns.OPT {
	o := r.IsEdns0()
	if o == nil {
		r.SetEdns0(4096, false)
		o = r.IsEdns0()
	}
	return o
}

// ServeDNS implements the plugin.Handler interface. This method gets called when example is used
// in a Server.
func (e *Ecs) ServeDNS(ctx context.Context, w dns.ResponseWriter, r *dns.Msg) (int, error) {
	o := setupEdns0Opt(r)

	for _, s := range o.Option {
		if es, ok := s.(*dns.EDNS0_SUBNET); ok {
			// Log for debug
			fmt.Printf("[ecs] Incoming EDNS0_SUBNET present: family=%d addr=%v srcmask=%d\n",
				es.Family, es.Address, es.SourceNetmask)

			// Build textual network/mask representation and publish as metadata
			if es.Family == 1 && es.Address != nil {
				ip4 := es.Address.To4()
				if ip4 != nil {
					maskSize := int(es.SourceNetmask)
					mask := net.CIDRMask(maskSize, 32)
					network := ip4.Mask(mask)
					label := network.String() + "/" + strconv.Itoa(maskSize)
					metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
					fmt.Printf("[ecs] Published metadata ecs/subnet=%s\n", label)
				}
			} else if es.Family == 2 && es.Address != nil {
				ip6 := es.Address.To16()
				if ip6 != nil {
					maskSize := int(es.SourceNetmask)
					mask := net.CIDRMask(maskSize, 128)
					network := ip6.Mask(mask)
					label := network.String() + "/" + strconv.Itoa(maskSize)
					metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
					fmt.Printf("[ecs] Published metadata ecs/subnet=%s\n", label)
				}
			}

			// Now continue to next plugin (do not try to inject again)
			return plugin.NextOrFailure(e.Name(), e.Next, ctx, w, r)
		}
	}
	
	var srcOrig net.IP
	ip := w.RemoteAddr()
	if i, ok := ip.(*net.UDPAddr); ok {
		srcOrig = i.IP
	}
	if i, ok := ip.(*net.TCPAddr); ok {
		srcOrig = i.IP
	}

	if srcOrig == nil {
		fmt.Printf("[ecs] ServeDNS: cannot determine client IP from RemoteAddr: %v\n", ip)
		return plugin.NextOrFailure(e.Name(), e.Next, ctx, w, r)
	}

	tmp4 := srcOrig.To4()
	// Skip 127.0.0.0/8
	if tmp4 != nil && tmp4[0] == 127 {
		fmt.Printf("[ecs] ServeDNS: client in loopback, skipping\n")
		return plugin.NextOrFailure(e.Name(), e.Next, ctx, w, r)
	}

	ecs := &dns.EDNS0_SUBNET{Code: dns.EDNS0SUBNET}
	o.Option = append(o.Option, ecs)

	if tmp4 != nil {
		ecs.Family = 1
		ecs.Address = srcOrig.Mask(e.v4Mask)
		ecs.SourceNetmask = e.v4MaskSize
	} else {
		ecs.Family = 2
		ecs.Address = srcOrig.Mask(e.v6Mask)
		ecs.SourceNetmask = e.v6MaskSize
	}
	ecs.SourceScope = 0

	fmt.Printf("[ecs] Injected EDNS0_SUBNET to request: family=%d addr=%v mask=%d srcOrig=%v\n",
		ecs.Family, ecs.Address, ecs.SourceNetmask, srcOrig)

	return plugin.NextOrFailure(e.Name(), e.Next, ctx, &ecsWriter{w}, r)
}

// Name implements the Handler interface.
func (e *Ecs) Name() string { return "ecs" }

// ecsWriter removes the ECS option from responses to requests that DID NOT originally include one
// See https://www.rfc-editor.org/rfc/rfc7871#section-7.2.2
type ecsWriter struct {
	dns.ResponseWriter
}

// WriteMsg implements the dns.ResponseWriter interface.
func (w *ecsWriter) WriteMsg(res *dns.Msg) error {
	// Remove ECS option
	o := res.IsEdns0()
	if o != nil {
		for k, s := range o.Option {
			if _, ok := s.(*dns.EDNS0_SUBNET); ok {
				o.Option[k] = o.Option[len(o.Option)-1]
				o.Option = o.Option[:len(o.Option)-1]
				break
			}
		}
	}

	return w.ResponseWriter.WriteMsg(res)
}

// Metadata implements metadata.Provider so this plugin can publish metadata for others to consume.
// It will add label "ecs/subnet" -> "<network>/<mask>" (e.g. "192.168.1.0/24") or empty string.
func (e *Ecs) Metadata(ctx context.Context, state request.Request) context.Context {
	// Prefer EDNS0_SUBNET if present in the request message (this covers the main->secondary forwarded case).
	if state.Req != nil {
		fmt.Printf("[ecs.Metadata] state.Req non-nil, checking EDNS0_SUBNET in Req\n")
		if o := state.Req.IsEdns0(); o != nil {
			fmt.Printf("[ecs.Metadata] Req has EDNS0 OPT, options count=%d\n", len(o.Option))
			for _, opt := range o.Option {
				if es, ok := opt.(*dns.EDNS0_SUBNET); ok {
					fmt.Printf("[ecs.Metadata] Found EDNS0_SUBNET in state.Req: family=%d addr=%v srcmask=%d\n",
						es.Family, es.Address, es.SourceNetmask)
					// Build a textual network/mask representation.
					if es.Family == 1 && es.Address != nil {
						// IPv4
						ip4 := es.Address.To4()
						if ip4 != nil {
							maskSize := int(es.SourceNetmask)
							mask := net.CIDRMask(maskSize, 32)
							network := ip4.Mask(mask)
							label := network.String() + "/" + strconv.Itoa(maskSize)
							metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
							fmt.Printf("[ecs.Metadata] Publishing metadata ecs/subnet=%s\n", label)
							return ctx
						}
					}
					if es.Family == 2 && es.Address != nil {
						// IPv6
						ip6 := es.Address.To16()
						if ip6 != nil {
							maskSize := int(es.SourceNetmask)
							mask := net.CIDRMask(maskSize, 128)
							network := ip6.Mask(mask)
							label := network.String() + "/" + strconv.Itoa(maskSize)
							metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
							fmt.Printf("[ecs.Metadata] Publishing metadata ecs/subnet=%s\n", label)
							return ctx
						}
					}
				}
			}
		} else {
			fmt.Printf("[ecs.Metadata] Req has no EDNS0 OPT\n")
		}
	} else {
		fmt.Printf("[ecs.Metadata] state.Req is nil\n")
	}

	// Fallback: use client's source IP from request.Request and mask it with plugin config.
	ipStr := state.IP()
	fmt.Printf("[ecs.Metadata] Fallback checking state.IP(): %s\n", ipStr)
	if ipStr != "" {
		parsed := net.ParseIP(ipStr)
		if parsed != nil {
			if v4 := parsed.To4(); v4 != nil {
				netIP := v4.Mask(e.v4Mask)
				label := netIP.String() + "/" + strconv.Itoa(int(e.v4MaskSize))
				metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
				fmt.Printf("[ecs.Metadata] Publishing metadata via fallback ecs/subnet=%s\n", label)
				return ctx
			}
			// IPv6
			netIP := parsed.Mask(e.v6Mask)
			label := netIP.String() + "/" + strconv.Itoa(int(e.v6MaskSize))
			metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return label })
			fmt.Printf("[ecs.Metadata] Publishing metadata via fallback ecs/subnet=%s\n", label)
			return ctx
		}
	}

	// Nothing available -> publish empty string (metadata plugin treats empty as "no metadata").
	metadata.SetValueFunc(ctx, "ecs/subnet", func() string { return "" })
	fmt.Printf("[ecs.Metadata] No subnet info available, publishing empty metadata\n")
	return ctx
}
