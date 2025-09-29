#!/bin/bash

# Interactive Shopify Dev Server Manager
# Allows viewing and managing multiple dev servers

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
    echo -e "${CYAN}│               🚀 Shopify Dev Server Manager                   │${NC}"
    echo -e "${CYAN}│                    Interactive Dashboard                      │${NC}"
    echo -e "${CYAN}╰───────────────────────────────────────────────────────────────╯${NC}"
    echo ""
}

get_dev_servers() {
    # Get all shopify theme dev processes
    ps aux | grep "shopify theme dev" | grep -v grep | while read line; do
        PID=$(echo "$line" | awk '{print $2}')
        USER=$(echo "$line" | awk '{print $1}')
        CPU=$(echo "$line" | awk '{print $3}')
        MEM=$(echo "$line" | awk '{print $4}')
        TIME=$(echo "$line" | awk '{print $10}')

        # Extract port from command
        PORT=$(echo "$line" | grep -o -- '--port=[0-9]*' | cut -d'=' -f2)
        if [ -z "$PORT" ]; then
            PORT="3000" # default
        fi

        # Extract store from command
        STORE=$(echo "$line" | grep -o -- '--store=[^[:space:]]*' | cut -d'=' -f2)

        # Test if server is responding
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            STATUS="${GREEN}✅ Online${NC}"
        else
            STATUS="${RED}❌ Offline${NC}"
        fi

        echo "$PID|$USER|$CPU|$MEM|$TIME|$PORT|$STORE|$STATUS"
    done
}

show_servers() {
    echo -e "${BLUE}📋 Active Shopify Dev Servers:${NC}"
    echo -e "${CYAN}╭─────┬──────────┬───────┬───────┬──────────┬────────┬───────────────────────────┬─────────────────╮${NC}"

    # Header with better spacing and icons
    printf "${CYAN}│${NC} ${BLUE}%3s${NC} ${CYAN}│${NC} ${BLUE}%8s${NC} ${CYAN}│${NC} ${BLUE}%5s${NC} ${CYAN}│${NC} ${BLUE}%5s${NC} ${CYAN}│${NC} ${BLUE}%8s${NC} ${CYAN}│${NC} ${BLUE}%6s${NC} ${CYAN}│${NC} ${BLUE}%-25s${NC} ${CYAN}│${NC} ${BLUE}%-15s${NC} ${CYAN}│${NC}\n" "🆔 ID" "⚙️ PID" "📊 CPU" "💾 MEM" "⏱️ TIME" "🔌 PORT" "🏪 STORE" "📡 STATUS"
    echo -e "${CYAN}├─────┼──────────┼───────┼───────┼──────────┼────────┼───────────────────────────┼─────────────────┤${NC}"

    local counter=1
    local servers=""

    while IFS='|' read -r pid user cpu mem time port store status; do
        if [ -n "$pid" ]; then
            printf "${CYAN}│${NC} %-3s ${CYAN}│${NC} %-8s ${CYAN}│${NC} %-5s ${CYAN}│${NC} %-5s ${CYAN}│${NC} %-8s ${CYAN}│${NC} %-6s ${CYAN}│${NC} %-25s ${CYAN}│${NC} %-15s ${CYAN}│${NC}\n" "$counter" "$pid" "$cpu%" "$mem%" "$time" "$port" "${store:0:25}" "$status"
            servers="$servers$counter:$pid:$port:$store\n"
            counter=$((counter + 1))
        fi
    done < <(get_dev_servers)

    if [ $counter -eq 1 ]; then
        echo -e "${CYAN}│${NC}                                   ${YELLOW}No active servers found${NC}                                   ${CYAN}│${NC}"
        echo -e "${CYAN}╰─────────────────────────────────────────────────────────────────────────────────────────────────────╯${NC}"
        echo ""
        return 1
    fi

    echo -e "${CYAN}╰─────┴──────────┴───────┴───────┴──────────┴────────┴───────────────────────────┴─────────────────╯${NC}"
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
    local store=$(echo "$server_info" | cut -d':' -f4)

    echo -e "${YELLOW}🔄 Killing server...${NC}"
    echo "  PID: $pid"
    echo "  Port: $port"
    echo "  Store: $store"
    echo ""

    if kill "$pid" 2>/dev/null; then
        echo -e "${GREEN}✅ Server killed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to kill server (PID: $pid)${NC}"
        echo "Try: sudo kill $pid"
    fi
}

kill_all_servers() {
    echo -e "${YELLOW}⚠️  Are you sure you want to kill ALL Shopify dev servers? (y/N)${NC}"
    read -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🔄 Killing all servers...${NC}"
        local count=0

        while IFS='|' read -r pid user cpu mem time port store status; do
            if [ -n "$pid" ]; then
                if kill "$pid" 2>/dev/null; then
                    echo "  ✅ Killed PID $pid (port $port)"
                    count=$((count + 1))
                else
                    echo "  ❌ Failed to kill PID $pid"
                fi
            fi
        done < <(get_dev_servers)

        echo ""
        echo -e "${GREEN}🎉 Killed $count server(s)${NC}"
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
    local store=$(echo "$server_info" | cut -d':' -f4)

    echo -e "${CYAN}╭─ 📊 Server Details ─────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC} ⚙️  PID: ${YELLOW}$pid${NC}                                             ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 🔌 Port: ${YELLOW}$port${NC}                                           ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} 🏪 Store: ${YELLOW}$store${NC}                                         ${CYAN}│${NC}"
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