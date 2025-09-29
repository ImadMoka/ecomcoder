#!/bin/bash

# Interactive Shopify Dev Server Manager
# Shows all active development servers on ports 3000+ and 4000+

set -e

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

show_header() {
    clear
    echo -e "${CYAN}╭───────────────────────────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│               🚀 Development Server Manager                   │${NC}"
    echo -e "${CYAN}│                    Interactive Dashboard                      │${NC}"
    echo -e "${CYAN}╰───────────────────────────────────────────────────────────────╯${NC}"
    echo ""
}

get_active_servers() {
    # Get all processes using ports 3000+ and 4000+
    {
        # Get Shopify theme dev processes (3000+ range)
        ps aux | grep "node.*shopify theme dev" | grep -v grep | while read line; do
            PID=$(echo "$line" | awk '{print $2}')
            PORT=$(echo "$line" | grep -o -- '--port=[0-9]*' | cut -d'=' -f2)
            STORE=$(echo "$line" | grep -o -- '--store=[^[:space:]]*' | cut -d'=' -f2 | sed 's/"//g')

            if [ -n "$PORT" ] && [ "$PORT" -ge 3000 ]; then
                echo "$PID|$PORT|shopify|$STORE"
            fi
        done

        # Get proxy server processes (4000+ range)
        ps aux | grep "proxy-server-.*\.js" | grep -v grep | while read line; do
            PID=$(echo "$line" | awk '{print $2}')
            PORT=$(echo "$line" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+$/ && $i >= 4000) print $i}' | tail -1)

            if [ -n "$PORT" ] && [ "$PORT" -ge 4000 ]; then
                echo "$PID|$PORT|proxy|N/A"
            fi
        done
    } | sort -t'|' -k2 -n
}

show_servers() {
    echo -e "${BLUE}📋 Active Development Servers:${NC}"
    echo -e "${CYAN}╭─────┬────────┬──────────┬──────────┬────────────╮${NC}"

    # Header
    printf "${CYAN}│${NC} ${BLUE}%3s${NC} ${CYAN}│${NC} ${BLUE}%-6s${NC} ${CYAN}│${NC} ${BLUE}%-8s${NC} ${CYAN}│${NC} ${BLUE}%-8s${NC} ${CYAN}│${NC} ${BLUE}%-10s${NC} ${CYAN}│${NC}\\n" "ID" "PID" "TYPE" "PORT" "STATUS"
    echo -e "${CYAN}├─────┼────────┼──────────┼──────────┼────────────┤${NC}"

    local counter=1
    local servers=""

    while IFS='|' read -r pid port type store; do
        if [ -n "$pid" ]; then
            # Test server status
            if kill -0 "$pid" 2>/dev/null; then
                if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port" 2>/dev/null | grep -q "200"; then
                    status_display="Running"
                else
                    status_display="Process"
                fi
            else
                status_display="Dead"
            fi

            # Format type
            if [ "$type" = "shopify" ]; then
                type_display="Shopify"
            else
                type_display="Proxy"
            fi

            printf "${CYAN}│${NC} %-3s ${CYAN}│${NC} %-6s ${CYAN}│${NC} %-8s ${CYAN}│${NC} %-8s ${CYAN}│${NC} %-10s ${CYAN}│${NC}\\n" "$counter" "$pid" "$type_display" "$port" "$status_display"

            servers="${servers}${counter}:${pid}:${port}:${type}\\n"
            counter=$((counter + 1))
        fi
    done < <(get_active_servers)

    if [ $counter -eq 1 ]; then
        echo -e "${CYAN}│${NC}                   ${YELLOW}No active servers found${NC}                   ${CYAN}│${NC}"
        echo -e "${CYAN}╰─────┴────────┴──────────┴──────────┴────────────╯${NC}"
        echo ""
        return 1
    fi

    echo -e "${CYAN}╰─────┴────────┴──────────┴──────────┴────────────╯${NC}"
    echo ""

    # Store server info for later use
    echo -e "$servers" > /tmp/dev_servers_list
    return 0
}

show_menu() {
    echo -e "${PURPLE}╭─ 🎯 Available Actions ──────────────────────────────────╮${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}1${NC}) 🔪 Kill specific server                           ${PURPLE}│${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}2${NC}) ⚠️  Kill all servers                             ${PURPLE}│${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}3${NC}) 🔄 Refresh list                                  ${PURPLE}│${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}4${NC}) 🌐 Open server in browser                        ${PURPLE}│${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}5${NC}) 📊 Show server details                          ${PURPLE}│${NC}"
    echo -e "${PURPLE}│${NC}  ${GREEN}q${NC}) 👋 Quit                                          ${PURPLE}│${NC}"
    echo -e "${PURPLE}╰─────────────────────────────────────────────────────────╯${NC}"
    echo ""
    echo -n -e "${YELLOW}Choose an action [1-5/q]: ${NC}"
}

kill_server() {
    local server_id=$1
    local server_info=$(grep "^$server_id:" /tmp/dev_servers_list 2>/dev/null | head -1)

    if [ -z "$server_info" ]; then
        echo -e "${RED}❌ Invalid server ID: $server_id${NC}"
        return 1
    fi

    local pid=$(echo "$server_info" | cut -d':' -f2)
    local port=$(echo "$server_info" | cut -d':' -f3)
    local type=$(echo "$server_info" | cut -d':' -f4)

    echo -e "${YELLOW}🔄 Killing $type server...${NC}"
    echo "  PID: $pid"
    echo "  Port: $port"
    echo ""

    # Try normal kill first, then force kill if needed
    if kill "$pid" 2>/dev/null; then
        sleep 1
        # Check if process is still running
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Process still running, force killing..."
            if kill -9 "$pid" 2>/dev/null; then
                echo -e "${GREEN}✅ Server force killed successfully${NC}"
            else
                echo -e "${RED}❌ Failed to force kill server (PID: $pid)${NC}"
                echo "Try: sudo kill -9 $pid"
            fi
        else
            echo -e "${GREEN}✅ Server killed successfully${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to kill server (PID: $pid)${NC}"
        echo "Try: sudo kill -9 $pid"
    fi
}

kill_all_servers() {
    echo -e "${YELLOW}⚠️  Are you sure you want to kill ALL development servers? (y/N)${NC}"
    read -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🔄 Killing all servers...${NC}"
        local killed_count=0

        while IFS='|' read -r pid port type store; do
            if [ -n "$pid" ]; then
                if kill "$pid" 2>/dev/null; then
                    sleep 0.5
                    # Check if process is still running
                    if kill -0 "$pid" 2>/dev/null; then
                        # Force kill if still running
                        if kill -9 "$pid" 2>/dev/null; then
                            echo "  ✅ Force killed $type PID $pid (port $port)"
                            killed_count=$((killed_count + 1))
                        else
                            echo "  ❌ Failed to force kill $type PID $pid"
                        fi
                    else
                        echo "  ✅ Killed $type PID $pid (port $port)"
                        killed_count=$((killed_count + 1))
                    fi
                else
                    echo "  ❌ Failed to kill $type PID $pid"
                fi
            fi
        done < <(get_active_servers)

        echo ""
        echo -e "${GREEN}🎉 Killed $killed_count server(s)${NC}"
    else
        echo -e "${BLUE}ℹ️  Operation cancelled${NC}"
    fi
}

open_in_browser() {
    local server_id=$1
    local server_info=$(grep "^$server_id:" /tmp/dev_servers_list 2>/dev/null | head -1)

    if [ -z "$server_info" ]; then
        echo -e "${RED}❌ Invalid server ID: $server_id${NC}"
        return 1
    fi

    local port=$(echo "$server_info" | cut -d':' -f3)
    local url="http://127.0.0.1:$port"

    echo -e "${BLUE}🌐 Opening $url in browser...${NC}"

    if command -v open &> /dev/null; then
        open "$url"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$url"
    else
        echo -e "${YELLOW}⚠️  Could not open browser automatically${NC}"
        echo "Please open: $url"
    fi
}

show_server_details() {
    local server_id=$1
    local server_info=$(grep "^$server_id:" /tmp/dev_servers_list 2>/dev/null | head -1)

    if [ -z "$server_info" ]; then
        echo -e "${RED}❌ Invalid server ID: $server_id${NC}"
        return 1
    fi

    local pid=$(echo "$server_info" | cut -d':' -f2)
    local port=$(echo "$server_info" | cut -d':' -f3)
    local type=$(echo "$server_info" | cut -d':' -f4)

    echo -e "${CYAN}╭─ 📊 Server Details ─────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC} ⚙️  PID: ${YELLOW}$pid${NC}                                             ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 🔌 Port: ${YELLOW}$port${NC}                                           ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 📝 Type: ${YELLOW}$type${NC}                                           ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 🌐 URL: ${BLUE}http://127.0.0.1:$port${NC}                              ${CYAN}│${NC}"
    echo -e "${CYAN}╰───────────────────────────────────────────────────────────────╯${NC}"
    echo ""

    echo -e "${PURPLE}╭─ 📈 Process Information ────────────────────────────────╮${NC}"
    ps -p "$pid" -o pid,ppid,etime,rss,vsz,cmd 2>/dev/null || echo "Process not found"
    echo -e "${PURPLE}╰───────────────────────────────────────────────────────────────╯${NC}"
    echo ""

    echo "🌐 Connectivity Test:"
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Server responding (HTTP $http_code)${NC}"
    else
        echo -e "${RED}❌ Server not responding (HTTP $http_code)${NC}"
    fi
}

main() {
    while true; do
        show_header

        if ! show_servers; then
            echo ""
            echo -e "${BLUE}Press any key to refresh or 'q' to quit...${NC}"
            read -n 1 -r
            if [[ $REPLY =~ ^[Qq]$ ]]; then
                break
            fi
            continue
        fi

        show_menu
        read -r choice
        echo ""

        case $choice in
            1)
                echo -n "Enter server ID to kill: "
                read -r server_id
                kill_server "$server_id"
                echo ""
                echo "Press any key to continue..."
                read -n 1 -r
                ;;
            2)
                kill_all_servers
                echo ""
                echo "Press any key to continue..."
                read -n 1 -r
                ;;
            3)
                continue
                ;;
            4)
                echo -n "Enter server ID to open in browser: "
                read -r server_id
                open_in_browser "$server_id"
                echo ""
                echo "Press any key to continue..."
                read -n 1 -r
                ;;
            5)
                echo -n "Enter server ID for details: "
                read -r server_id
                show_server_details "$server_id"
                echo ""
                echo "Press any key to continue..."
                read -n 1 -r
                ;;
            q|Q)
                break
                ;;
            *)
                echo -e "${RED}❌ Invalid option: $choice${NC}"
                echo "Press any key to continue..."
                read -n 1 -r
                ;;
        esac
    done

    # Cleanup
    rm -f /tmp/dev_servers_list
    echo -e "${GREEN}👋 Goodbye!${NC}"
}

# Run the main function
main